const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const assert = require("node:assert/strict");

describe("Echo V2 full cryptographic authorization flow", function () {
  it("generates a fresh proof and executes through the real verifier", async function () {
    const [owner, validator] = await ethers.getSigners();

    // Deploy the actual generated Groth16 verifier.
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    // Deploy the test registry and authorize our test validator.
    const Registry = await ethers.getContractFactory("MockRegistry");
    const registry = await Registry.deploy();
    await registry.setValidator(validator.address, true, true);

    // Deploy the actual V2 bridge.
    const Bridge = await ethers.getContractFactory("EchoAuthorizationBridgeV2");
    const bridge = await Bridge.deploy(verifier.target, registry.target);

    // Deploy the actual V2 smart account.
    const Account = await ethers.getContractFactory("EchoSmartAccountV2");
    const account = await Account.deploy(
      owner.address,
      ethers.ZeroAddress,
      bridge.target
    );

    // Deploy a harmless local target contract.
    const Target = await ethers.getContractFactory("TestTarget");
    const target = await Target.deploy();

    // Build transaction data using the actual deployed target.
    const data = target.interface.encodeFunctionData("setValue", [123]);
    const hash = BigInt(ethers.keccak256(data));

    const network = await ethers.provider.getNetwork();
    const block = await ethers.provider.getBlock("latest");

    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    const poseidonHash = (...values) =>
      F.toString(poseidon(values.map((v) => BigInt(v))));

    // Actual transaction and authorization values.
    const input = {
      account: BigInt(account.target).toString(),
      validator: BigInt(validator.address).toString(),
      target: BigInt(target.target).toString(),
      value: "0",
      calldataHashLow: (hash & ((1n << 128n) - 1n)).toString(),
      calldataHashHigh: (hash >> 128n).toString(),
      chainId: network.chainId.toString(),
      nonce: "0",
      deadline: (BigInt(block.timestamp) + 3600n).toString(),

      targetX: "100000",
      targetY: "200000",
      maxDistanceSq: "10000",
      minTimestamp: (BigInt(block.timestamp) - 60n).toString(),
      maxTimestamp: (BigInt(block.timestamp) + 60n).toString(),

      fragmentPayload: "42",
      fragmentSalt: "123456",
      checkpointX: "100050",
      checkpointY: "200000",
      checkpointTimestamp: block.timestamp.toString()
    };

    input.expectedFragmentCommitment = poseidonHash(
      input.fragmentPayload,
      input.fragmentSalt
    );

    input.expectedAuthorizationCommitment = poseidonHash(
      input.account,
      input.validator,
      input.target,
      input.value,
      input.calldataHashLow,
      input.calldataHashHigh,
      input.chainId,
      input.nonce,
      input.deadline,
      input.expectedFragmentCommitment,
      input.targetX,
      input.targetY,
      input.maxDistanceSq,
      input.minTimestamp,
      input.maxTimestamp
    );

    input.expectedNullifier = poseidonHash(
      input.account,
      input.expectedAuthorizationCommitment
    );

    console.log("Generating fresh V2 proof...");

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      "build/v2/EchoAuthorizationVerifierV2_js/EchoAuthorizationVerifierV2.wasm",
      "build/v2/EchoAuthorizationVerifierV2_final.zkey"
    );

    assert.equal(publicSignals.length, 17);

    // Verify the proof with the JavaScript verification key.
    const verificationKey = require("../build/v2/verification_key.json");
    const jsValid = await snarkjs.groth16.verify(
      verificationKey,
      publicSignals,
      proof
    );

    assert.equal(jsValid, true, "JavaScript proof verification failed");
    console.log("JavaScript proof verification: PASSED");

    // Convert proof to the generated Solidity verifier's arguments.
    const calldata = await snarkjs.groth16.exportSolidityCallData(
      proof,
      publicSignals
    );

    const args = JSON.parse("[" + calldata + "]");

    // Verify directly with the actual deployed Solidity verifier.
    const solidityValid = await verifier.verifyProof(
      args[0],
      args[1],
      args[2],
      args[3]
    );

    assert.equal(solidityValid, true, "Solidity proof verification failed");
    console.log("Solidity proof verification: PASSED");

    // Submit the same real proof through the actual smart account and bridge.
    await account.executeAuthorized(
      args[0],
      args[1],
      args[2],
      args[3],
      target.target,
      0,
      data
    );

    assert.equal(await target.storedValue(), 123n);
    assert.equal(await account.nonce(), 1n);
    assert.equal(
      await bridge.consumedNullifiers(BigInt(input.expectedNullifier)),
      true
    );

    console.log("Smart account execution: PASSED");
    console.log("Nullifier consumption: PASSED");
    console.log("Local account:", account.target);
    console.log("Local verifier:", verifier.target);
  });
});
