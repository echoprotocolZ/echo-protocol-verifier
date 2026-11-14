// Adversarial arithmetic tests against the compiled candidate V3 Circom witness.
// Not a Groth16 verifier test or a claim of physical GPS authenticity.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildPoseidon } = require("circomlibjs");

(async () => {
  const poseidon = await buildPoseidon();
  const H = (...xs) => poseidon.F.toString(poseidon(xs.map(BigInt)));
  const base = {
    account:"100", delegatee:"101", validator:"102", target:"103", value:"104",
    calldataHashLow:"105", calldataHashHigh:"106", chainId:"31337", nonce:"7",
    deadline:"1700000200", fragmentPayload:"41", fragmentSalt:"42",
    checkpointX:"100", checkpointY:"200", checkpointTimestamp:"1700000000",
    targetX:"102", targetY:"203", maxDistanceSq:"13",
    minTimestamp:"1699999999", maxTimestamp:"1700000001"
  };
  function prepare(changes) {
    const i = { ...base, ...changes };
    i.expectedFragmentCommitment = H(i.fragmentPayload, i.fragmentSalt);
    i.expectedCheckpointCommitment = H(i.checkpointX, i.checkpointY, i.checkpointTimestamp);
    i.expectedCheckpointTimestamp = i.checkpointTimestamp;
    const a = H(i.account,i.delegatee,i.validator,i.target,i.value,i.calldataHashLow,
      i.calldataHashHigh,i.chainId,i.nonce,i.deadline,i.expectedFragmentCommitment,
      i.targetX,i.targetY,i.maxDistanceSq,i.minTimestamp,i.maxTimestamp);
    i.expectedAuthorizationCommitment = H(a,i.expectedCheckpointCommitment);
    i.expectedNullifier = H(i.account,i.expectedAuthorizationCommitment);
    return i;
  }
  const dir = path.resolve("build/v3-aligned/EchoAuthorizationVerifierV3Aligned_js");
  const wc = require(path.join(dir,"witness_calculator.js"));
  const calc = await wc(fs.readFileSync(path.join(dir,"EchoAuthorizationVerifierV3Aligned.wasm")));
  const cases = [
    ["exact distance boundary", {}, true],
    ["one unit outside distance boundary", {targetX:"103"}, false],
    ["zero radius with exact coordinate match", {targetX:"100",targetY:"200",maxDistanceSq:"0"}, true],
    ["zero radius with mismatched coordinate", {targetX:"101",targetY:"200",maxDistanceSq:"0"}, false],
    ["minimum timestamp inclusive", {minTimestamp:"1700000000"}, true],
    ["maximum timestamp inclusive", {maxTimestamp:"1700000000"}, true],
    ["timestamp before minimum", {minTimestamp:"1700000001"}, false],
    ["timestamp after maximum", {maxTimestamp:"1699999999"}, false],
    ["checkpoint after deadline", {deadline:"1699999999"}, false],
    ["32-bit coordinate maximum", {checkpointX:"4294967295",targetX:"4294967295",checkpointY:"0",targetY:"0",maxDistanceSq:"0"}, true],
    ["coordinate above 32-bit maximum", {checkpointX:"4294967296",targetX:"4294967295",checkpointY:"0",targetY:"0",maxDistanceSq:"1"}, false],
    ["radius above 64-bit maximum", {maxDistanceSq:"18446744073709551616"}, false],
    ["64-bit timestamp overflow", {checkpointTimestamp:"18446744073709551616",minTimestamp:"0",maxTimestamp:"18446744073709551615",deadline:"18446744073709551615"}, false],
    ["64-bit deadline overflow", {deadline:"18446744073709551616"}, false],
    ["negative coordinate encoding", {checkpointX:"-1"}, false]
  ];
  for (const [name, changes, accepted] of cases) {
    let succeeded = false;
    try { await calc.calculateWitness(prepare(changes), true); succeeded = true; }
    catch (e) { if (accepted) throw new Error(name + ": unexpected failure: " + e.message); }
    assert.equal(succeeded, accepted, name + ": incorrect circuit acceptance");
    console.log("PASS " + (accepted ? "accept " : "reject ") + name);
  }
  console.log("PASS: " + cases.length + " V3 arithmetic boundary regressions");
})().catch(e => { console.error(e); process.exitCode = 1; });
