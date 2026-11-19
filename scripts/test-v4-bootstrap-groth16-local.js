"use strict";
// EXPERIMENTAL LOCAL-ONLY GROTH16: ephemeral keys are NOT production trusted setup.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
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
    const snarkCli = require.resolve("snarkjs/cli.js");
    command(process.execPath, [snarkCli, "powersoftau", "new", "bn128", "12", ptau0, "-v"]);
    command(process.execPath, [snarkCli, "powersoftau", "contribute", ptau0, ptau1, "--name=local-test-only", "-e=echo-bootstrap-ephemeral-test-entropy-not-production"]);
    command(process.execPath, [snarkCli, "powersoftau", "prepare", "phase2", ptau1, ptau]);
    console.log("PROOF_STAGE: ephemeral powers of tau ready (NOT production trusted setup)");
    const zkey = path.join(dir, "bootstrap.zkey");
    command(process.execPath, [snarkCli, "groth16", "setup", r1cs, ptau, zkey]);
    const vk = await snarkjs.zKey.exportVerificationKey(zkey);
    console.log("PROOF_STAGE: ephemeral Groth16 key ready");
    const poseidon = await buildPoseidon();
    const hash = xs => poseidon.F.toString(poseidon(xs));
    const secret = 123456789n, salt = 987654321n;
    const account = 12345n, chainId = 31337n, bootstrapNonce = 0n, actionHash = 99999n;
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
    for (let i = 0; i < publicSignals.length; i++) {
      const altered = [...publicSignals];
      altered[i] = (BigInt(altered[i]) + 1n).toString();
      assert.equal(await snarkjs.groth16.verify(vk, altered, proof), false, `altered public signal ${i} must fail`);
    }
    console.log(`PASS local Groth16 proof and ${publicSignals.length} tampered public-signal rejections`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
