// Static verification-key ABI guard. Does not establish key provenance.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const source = fs.readFileSync("contracts/EchoAuthorizationVerifierV3.sol", "utf8");
const icX = [...source.matchAll(/uint256\s+constant\s+IC(\d+)x\s*=/g)].map(m => Number(m[1]));
const icY = [...source.matchAll(/uint256\s+constant\s+IC(\d+)y\s*=/g)].map(m => Number(m[1]));
assert.match(source, /uint\[20\]\s+calldata\s+_pubSignals/, "Verifier must take 20 public signals");
assert.deepEqual(icX, Array.from({length: 21}, (_, i) => i), "Expected IC0x through IC20x");
assert.deepEqual(icY, Array.from({length: 21}, (_, i) => i), "Expected IC0y through IC20y");
const fieldChecks = [...source.matchAll(/checkField\(calldataload\(add\(_pubSignals,\s*(\d+)\)\)\)/g)].map(m => Number(m[1]));
assert.deepEqual(fieldChecks, Array.from({length: 20}, (_, i) => i * 32),
  "Verifier must field-check all 20 public signals");
console.log("PASS: V3 Solidity verifier has 20 signals, 21 IC points, and 20 field checks");
console.log("WARNING: ABI shape alone does not prove this verifier key matches the aligned circuit.");
