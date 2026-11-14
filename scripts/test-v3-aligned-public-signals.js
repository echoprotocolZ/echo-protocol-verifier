// Validate the aligned V3 circuit's actual witness public-signal ordering.
// Does not establish Groth16 trusted-setup validity or production readiness.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildPoseidon } = require("circomlibjs");

async function main() {
  const poseidon = await buildPoseidon();
  const H = (...xs) => poseidon.F.toString(poseidon(xs.map(BigInt)));
  const input = {
    account: "100", delegatee: "101", validator: "102", target: "103",
    value: "104", calldataHashLow: "105", calldataHashHigh: "106",
    chainId: "31337", nonce: "7", deadline: "1700000200",
    fragmentPayload: "41", fragmentSalt: "42",
    checkpointX: "100", checkpointY: "200", checkpointTimestamp: "1700000000",
    targetX: "102", targetY: "203", maxDistanceSq: "13",
    minTimestamp: "1699999999", maxTimestamp: "1700000001",
  };
  input.expectedFragmentCommitment = H(input.fragmentPayload, input.fragmentSalt);
  input.expectedCheckpointCommitment = H(input.checkpointX, input.checkpointY, input.checkpointTimestamp);
  const auth1 = H(
    input.account, input.delegatee, input.validator, input.target, input.value,
    input.calldataHashLow, input.calldataHashHigh, input.chainId, input.nonce,
    input.deadline, input.expectedFragmentCommitment, input.targetX,
    input.targetY, input.maxDistanceSq, input.minTimestamp, input.maxTimestamp
  );
  input.expectedAuthorizationCommitment = H(auth1, input.expectedCheckpointCommitment);
  input.expectedNullifier = H(input.account, input.expectedAuthorizationCommitment);
  input.expectedCheckpointTimestamp = input.checkpointTimestamp;
  const wasmDir = path.resolve("build/v3-aligned/EchoAuthorizationVerifierV3Aligned_js");
  const wc = require(path.join(wasmDir, "witness_calculator.js"));
  const calc = await wc(fs.readFileSync(path.join(wasmDir, "EchoAuthorizationVerifierV3Aligned.wasm")));
  const witness = await calc.calculateWitness(input, true);
  const expected = [
    input.expectedFragmentCommitment, input.expectedAuthorizationCommitment,
    input.expectedNullifier, input.account, input.delegatee, input.validator,
    input.target, input.value, input.calldataHashLow, input.calldataHashHigh,
    input.chainId, input.nonce, input.deadline, input.targetX, input.targetY,
    input.maxDistanceSq, input.minTimestamp, input.maxTimestamp,
    input.expectedCheckpointCommitment, input.expectedCheckpointTimestamp,
  ];
  assert.equal(witness[0].toString(), "1", "witness constant");
  for (let i = 0; i < expected.length; i++) {
    assert.equal(witness[i + 1].toString(), expected[i].toString(),
      `public signal ${i} does not match Solidity bridge ABI`);
  }
  console.log("PASS: all 20 aligned V3 witness public signals match Solidity ABI order");
  const mutated = { ...input, expectedCheckpointTimestamp: "1700000001" };
  await assert.rejects(calc.calculateWitness(mutated, true),
    "mismatched checkpoint timestamp must violate circuit constraints");
  console.log("PASS: timestamp substitution rejected by circuit");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
