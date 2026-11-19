"use strict";
// EXPERIMENTAL LOCAL-ONLY GROTH16: ephemeral keys are NOT production trusted setup.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const solc = require("solc");
const hre = require("hardhat");
function command(exe, args) {
  const p = spawnSync(exe, args, { encoding: "utf8", timeout: 60000 });
  if (p.error || p.status !== 0) throw new Error(String(p.error || p.stderr || p.stdout));
}
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-bootstrap-groth16-"));
  try {
    const circuit = path.resolve("circuits/v4/EchoBootstrapAuthorizationV1.circom");
    command(process.execPath, [require.resolve("circom2/cli.js"), circuit, "-l", path.resolve("node_modules"), "--wasm", "--r1cs", "-o", dir]);
    console.log("PROOF_STAGE: circuit compiled");
    const r1cs = path.join(dir, "EchoBootstrapAuthorizationV1.r1cs");
    const wasm = path.join(dir, "EchoBootstrapAuthorizationV1_js", "EchoBootstrapAuthorizationV1.wasm");
    const ptau0 = path.join(dir, "initial.ptau"), ptau1 = path.join(dir, "contributed.ptau"), ptau = path.join(dir, "final.ptau");
    const snarkCli = path.resolve("node_modules/.bin/snarkjs");
    command(snarkCli, ["powersoftau", "new", "bn128", "12", ptau0, "-v"]);
    command(snarkCli, ["powersoftau", "contribute", ptau0, ptau1, "--name=local-test-only", "-e=echo-bootstrap-ephemeral-test-entropy-not-production"]);
    command(snarkCli, ["powersoftau", "prepare", "phase2", ptau1, ptau]);
    console.log("PROOF_STAGE: ephemeral powers of tau ready (NOT production trusted setup)");
    const zkey = path.join(dir, "bootstrap.zkey");
    command(snarkCli, ["groth16", "setup", r1cs, ptau, zkey]);
    const vk = await snarkjs.zKey.exportVerificationKey(zkey);
    console.log("PROOF_STAGE: ephemeral Groth16 key ready");
    const poseidon = await buildPoseidon();
    const hash = xs => poseidon.F.toString(poseidon(xs));
    const secret = 123456789n, salt = 987654321n;
    const [signer] = await hre.ethers.getSigners();
    const account = BigInt(signer.address), chainId = (await hre.ethers.provider.getNetwork()).chainId;
    const bootstrapNonce = 0n, actionHash = 99999n;
    const input = {
      trustedRoot: hash([secret, salt]),
      account: String(account), chainId: String(chainId), bootstrapNonce: String(bootstrapNonce),
      actionHash: String(actionHash),
      expectedNullifier: hash([secret, account, chainId, bootstrapNonce, actionHash]),
      enrollmentSecret: String(secret), enrollmentSalt: String(salt)
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
    assert.equal(await snarkjs.groth16.verify(vk, publicSignals, proof), true, "valid proof must verify");
    console.log("PROOF_STAGE: valid Groth16 proof verified");
    // Compile the exact verifier exported from this ephemeral zkey, then deploy locally.
    const verifierSol = path.join(dir, "Verifier.sol");
    command(snarkCli, ["zkey", "export", "solidityverifier", zkey, verifierSol]);
    const sources = {
      "Verifier.sol": { content: fs.readFileSync(verifierSol, "utf8") },
      "EchoBootstrapProofGateV1.sol": { content: fs.readFileSync(path.resolve("contracts/EchoBootstrapProofGateV1.sol"), "utf8") },
      "LocalRegistry.sol": { content: "pragma solidity ^0.8.24; contract LocalRegistry {}" }
    };
    const compiled = JSON.parse(solc.compile(JSON.stringify({
      language: "Solidity", sources,
      settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } }
    })));
    const errors = (compiled.errors || []).filter(e => e.severity === "error");
    assert.equal(errors.length, 0, JSON.stringify(errors));
    async function deploy(file, name, args = []) {
      const artifact = compiled.contracts[file][name];
      const factory = new hre.ethers.ContractFactory(artifact.abi, artifact.evm.bytecode.object, signer);
      const contract = await factory.deploy(...args);
      await contract.waitForDeployment();
      return contract;
    }
    const verifierName = Object.keys(compiled.contracts["Verifier.sol"])[0];
    const verifier = await deploy("Verifier.sol", verifierName);
    const registry = await deploy("LocalRegistry.sol", "LocalRegistry");
    const gate = await deploy("EchoBootstrapProofGateV1.sol", "EchoBootstrapProofGateV1",
      [signer.address, await registry.getAddress(), await verifier.getAddress(), BigInt(input.trustedRoot)]);
    // snarkjs uses [pi_a[0],pi_a[1]], reversed G2 pair order for Solidity.
    const a = [proof.pi_a[0], proof.pi_a[1]];
    const b = [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]];
    const c = [proof.pi_c[0], proof.pi_c[1]];
    const signals = publicSignals.map(BigInt);
    assert.equal(await gate.verifyBootstrapProof(a, b, c, signals), true);
    for (let i = 0; i < signals.length; i++) {
      const changed = [...signals]; changed[i] += 1n;
      await assert.rejects(gate.verifyBootstrapProof(a, b, c, changed),
        undefined, `on-chain altered signal ${i} must reject`);
    }
    console.log("PASS local EVM Groth16 verifier + immutable proof gate and six tamper rejections");

    // End-to-end: real proof -> immutable gate -> executor -> V3 account-scoped registry.
    await hre.run("compile");
    const realRegistry = await (await hre.ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    await realRegistry.waitForDeployment();
    const pairFactory = await (await hre.ethers.getContractFactory("EchoBootstrapPairFactoryV1")).deploy();
    await pairFactory.waitForDeployment();
    const pairSalt = hre.ethers.id("echo-bootstrap-e2e-local-only");
    const registryAddress = await realRegistry.getAddress();
    const executorAddress = await pairFactory.predictExecutor(registryAddress, pairSalt);
    const gateAddress = await pairFactory.predictGate();
    await (await pairFactory.deployPair(registryAddress, await verifier.getAddress(),
      BigInt(input.trustedRoot), pairSalt)).wait();
    const executor = await hre.ethers.getContractAt("EchoBootstrapBridgeExecutorV1", executorAddress);
    const pairGate = await hre.ethers.getContractAt("EchoBootstrapProofGateV1", gateAddress);
    assert.equal(await pairGate.account(), executorAddress);
    const bridge = await deploy("LocalRegistry.sol", "LocalRegistry");
    const bridgeAddress = await bridge.getAddress();
    const deadline = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp + 3600);
    const action = await executor.actionHash(bridgeAddress, true, 0n, deadline);
    const accountNumber = BigInt(executorAddress);
    const executionInput = {
      ...input, account: String(accountNumber), bootstrapNonce: "0",
      actionHash: String(action),
      expectedNullifier: hash([secret, accountNumber, chainId, 0n, action])
    };
    const generated = await snarkjs.groth16.fullProve(executionInput, wasm, zkey);
    const ep = generated.proof;
    const ea = [ep.pi_a[0], ep.pi_a[1]];
    const eb = [[ep.pi_b[0][1], ep.pi_b[0][0]], [ep.pi_b[1][1], ep.pi_b[1][0]]];
    const ec = [ep.pi_c[0], ep.pi_c[1]];
    const es = generated.publicSignals.map(BigInt);
    assert.equal(await realRegistry.authorizedCheckpointBridges(executorAddress, bridgeAddress), false);
    await assert.rejects(executor.configureCheckpointBridge(bridgeAddress, false, deadline, ea, eb, ec, es),
      undefined, "opposite authorization intent must reject");
    await (await executor.configureCheckpointBridge(bridgeAddress, true, deadline, ea, eb, ec, es)).wait();
    assert.equal(await realRegistry.authorizedCheckpointBridges(executorAddress, bridgeAddress), true);
    assert.equal(await executor.nextNonce(), 1n);
    assert.equal(await executor.usedNullifiers(es[5]), true);
    await assert.rejects(executor.configureCheckpointBridge(bridgeAddress, true, deadline, ea, eb, ec, es),
      undefined, "replayed proof must reject");
    const changed = [...es]; changed[4] += 1n;
    await assert.rejects(executor.configureCheckpointBridge(bridgeAddress, true, deadline, ea, eb, ec, changed),
      undefined, "tampered action commitment must reject");
    assert.equal(await realRegistry.authorizedCheckpointBridges(signer.address, bridgeAddress), false);
    console.log("PASS real Groth16 proof -> pair gate -> executor -> V3 registry; replay and substitution rejected");

    for (let i = 0; i < publicSignals.length; i++) {
      const altered = [...publicSignals];
      altered[i] = (BigInt(altered[i]) + 1n).toString();
      assert.equal(await snarkjs.groth16.verify(vk, altered, proof), false, `altered public signal ${i} must fail`);
    }
    console.log(`PASS local Groth16 proof and ${publicSignals.length} tampered public-signal rejections`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
