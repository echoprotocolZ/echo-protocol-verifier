// Fail closed if the legacy V3 circuit is silently treated as bridge-compatible.
// The aligned circuit is a candidate only; neither is approved for production.
const fs = require("node:fs");
const assert = require("node:assert/strict");
function publicSignals(file) {
  const src = fs.readFileSync(file, "utf8");
  const m = src.match(/component\s+main\s*\{\s*public\s*\[([\s\S]*?)\]\s*\}/);
  assert(m, "Cannot find public signals in " + file);
  return m[1].split(",").map(x => x.trim()).filter(Boolean);
}
const legacy = publicSignals("EchoAuthorizationVerifierV3.circom");
const aligned = publicSignals("EchoAuthorizationVerifierV3Aligned.circom");
assert.equal(legacy.length, 20);
assert.equal(aligned.length, 20);
assert.notDeepEqual(legacy, aligned, "Legacy unexpectedly matches candidate: review key provenance before removing quarantine");
const expected = [
  "expectedFragmentCommitment", "expectedAuthorizationCommitment", "expectedNullifier",
  "account", "delegatee", "validator", "target", "value",
  "calldataHashLow", "calldataHashHigh", "chainId", "nonce", "deadline",
  "targetX", "targetY", "maxDistanceSq", "minTimestamp", "maxTimestamp",
  "expectedCheckpointCommitment", "expectedCheckpointTimestamp"
];
assert.deepEqual(aligned, expected, "Aligned circuit must match bridge signal indexing");
const legacyCommitmentIndex = legacy.indexOf("expectedCheckpointCommitment");
const legacyTimestampIndex = legacy.indexOf("expectedCheckpointTimestamp");
assert.notEqual(legacyCommitmentIndex, 18);
assert.notEqual(legacyTimestampIndex, 19);
console.log("PASS: legacy V3 circuit quarantined from Solidity bridge ABI");
console.log("Legacy commitment/timestamp indices:", legacyCommitmentIndex, legacyTimestampIndex);
console.log("Aligned commitment/timestamp indices: 18, 19");
console.log("RELEASE BLOCKER: Do not reuse legacy Groth16 keys with aligned circuit.");
