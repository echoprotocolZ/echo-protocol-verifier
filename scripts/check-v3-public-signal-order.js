// Fail closed if V3 Circom public-signal ordering differs from Solidity's ABI.
// This is a static interface check, not a proof-system audit.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const circuitFile = process.argv[2] || "EchoAuthorizationVerifierV3.circom";
const source = fs.readFileSync(circuitFile, "utf8");
const match = source.match(/component\s+main\s*\{\s*public\s*\[([\s\S]*?)\]\s*\}/);
assert(match, "V3 circuit public signal declaration not found");
const actual = match[1].split(",").map(s => s.trim()).filter(Boolean);
const expected = [
  "expectedFragmentCommitment",
  "expectedAuthorizationCommitment",
  "expectedNullifier",
  "account",
  "delegatee",
  "validator",
  "target",
  "value",
  "calldataHashLow",
  "calldataHashHigh",
  "chainId",
  "nonce",
  "deadline",
  "targetX",
  "targetY",
  "maxDistanceSq",
  "minTimestamp",
  "maxTimestamp",
  "expectedCheckpointCommitment",
  "expectedCheckpointTimestamp"
];
assert.equal(actual.length, expected.length, "V3 public signal count mismatch");
const mismatches = expected.flatMap((name, i) => actual[i] === name ? [] : [
  `index ${i}: Solidity expects ${name}; Circom declares ${actual[i]}`
]);
if (mismatches.length) {
  console.error(`SECURITY BLOCKER: ${circuitFile} public signal ordering differs from bridge indexing`);
  for (const item of mismatches) console.error(item);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${circuitFile} public signal order matches Solidity bridge indexes`);
}
