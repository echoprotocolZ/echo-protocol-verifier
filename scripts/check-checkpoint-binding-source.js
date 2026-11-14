// Fail-closed source-level guard for critical bridge binding checks.
// This is a regression tripwire, NOT a substitute for EVM/proof integration tests.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const bridge = fs.readFileSync("contracts/EchoAuthorizationBridgeV4.sol", "utf8");
const dual = fs.readFileSync("contracts/EchoDualProofVerifierV4.sol", "utf8");
const compact = (s) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, "");
const b = compact(bridge), d = compact(dual);
const required = [
  ["signed timestamp must equal V3 public timestamp", b, "uint256(checkpoint.timestamp)!=signals[19]"],
  ["signed checkpoint commitment must equal V3 public signal", b, "uint256(checkpoint.checkpointCommitment)!=signals[18]"],
  ["signed authorization commitment must equal V3 public signal", b, "uint256(checkpoint.authorizationCommitment)!=signals[1]"],
  ["V3 proof must match signed checkpoint", d, "v3Signals[18]!=uint256(checkpoint.checkpointCommitment)"],
  ["V4 proof must match signed checkpoint", d, "v4Signals[4]!=uint256(checkpoint.checkpointCommitment)"],
  ["dual proof requires V3 verifier", d, "if(!v3Bridge.verifyCheckpointProof("],
  ["dual proof requires V4 gateway", d, "if(!v4Gateway.verifyApprovedGeographicProof("],
];
for (const [name, source, pattern] of required) {
  assert(source.includes(pattern), "MISSING SECURITY INVARIANT: " + name);
  console.log("PASS source guard:", name);
}
console.log("Source guards passed. Circuit soundness and real proof verification are NOT established.");
