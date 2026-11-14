// Witness-level regression tests for the experimental bound checkpoint circuit.
// This does not replace Groth16 verification or Solidity signature-binding tests.
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildPoseidon } = require("circomlibjs");

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const hash = (...inputs) => F.toString(poseidon(inputs.map(BigInt)));
  const wasm = path.resolve("build/bound/SpatiotemporalFragmentVerifierBound_js/SpatiotemporalFragmentVerifierBound.wasm");
  const wc = require(path.resolve("build/bound/SpatiotemporalFragmentVerifierBound_js/witness_calculator.js"));
  const fs = require("node:fs");
  const calculator = await wc(fs.readFileSync(wasm));
  const base = {
    fragmentPayload: "42", fragmentSalt: "17",
    checkpointX: "100", checkpointY: "200", checkpointTimestamp: "1700000000",
    targetX: "102", targetY: "203", maxDistanceSq: "13",
    minTimestamp: "1699999999", maxTimestamp: "1700000001",
  };
  base.expectedFragmentCommitment = hash(base.fragmentPayload, base.fragmentSalt);
  base.expectedCheckpointCommitment = hash(base.checkpointX, base.checkpointY, base.checkpointTimestamp);
  const succeeds = async (input) => {
    await calculator.calculateWitness(input, true);
  };
  const fails = async (label, input) => {
    let rejected = false;
    try { await succeeds(input); } catch (_) { rejected = true; }
    assert.equal(rejected, true, label + " must fail witness constraints");
    console.log("PASS reject:", label);
  };
  await succeeds(base);
  console.log("PASS accept: matching checkpoint and boundary distance");
  await fails("signed commitment from different timestamp", {
    ...base, expectedCheckpointCommitment: hash(base.checkpointX, base.checkpointY, "1700000001")
  });
  await fails("signed commitment from different coordinates", {
    ...base, expectedCheckpointCommitment: hash("101", base.checkpointY, base.checkpointTimestamp)
  });
  await fails("timestamp below window", { ...base, checkpointTimestamp: "1699999998",
    expectedCheckpointCommitment: hash(base.checkpointX, base.checkpointY, "1699999998") });
  await fails("timestamp above window", { ...base, checkpointTimestamp: "1700000002",
    expectedCheckpointCommitment: hash(base.checkpointX, base.checkpointY, "1700000002") });
  await fails("outside geographic radius", { ...base, targetX: "103" });
  await fails("noncanonical 32-bit coordinate", { ...base, checkpointX: "4294967296",
    expectedCheckpointCommitment: hash("4294967296", base.checkpointY, base.checkpointTimestamp) });
  await fails("fragment commitment substitution", {
    ...base, expectedFragmentCommitment: hash("43", base.fragmentSalt)
  });
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
