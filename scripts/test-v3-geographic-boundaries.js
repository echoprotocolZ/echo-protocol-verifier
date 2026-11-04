const assert = require("node:assert/strict");

const UINT32_MAX = (1n << 32n) - 1n;
const LAT_MAX = 1800000000n;
const LON_MAX = 3600000000n;

function check(tx, ty, cx, cy, radiusSq) {
  const coords = [tx, ty, cx, cy];

  const validUint32 = coords.every(
    v => v >= 0n && v <= UINT32_MAX
  );

  const validGPS =
    [tx, cx].every(v => v >= 0n && v <= LAT_MAX) &&
    [ty, cy].every(v => v >= 0n && v <= LON_MAX);

  const dx = cx - tx;
  const dy = cy - ty;
  const distanceSq = dx * dx + dy * dy;

  return {
    validUint32,
    validGPS,
    withinRadius: distanceSq <= radiusSq
  };
}

const cases = [
  ["Existing valid test", 100000n, 200000n, 100050n, 200000n, 10000n, true, true],
  ["Exactly on boundary", 100000n, 200000n, 100100n, 200000n, 10000n, true, true],
  ["Outside radius", 100000n, 200000n, 100101n, 200000n, 10000n, false, true],
  ["Invalid GPS latitude", 1800000001n, 200000n, 1800000001n, 200000n, 10000n, true, false],
  ["Invalid GPS longitude", 100000n, 3600000001n, 100000n, 3600000001n, 10000n, true, false]
];

for (const [name, tx, ty, cx, cy, radius, expectedRadius, expectedGPS] of cases) {
  const result = check(tx, ty, cx, cy, radius);

  assert.equal(result.validUint32, true, `${name}: uint32`);
  assert.equal(result.withinRadius, expectedRadius, `${name}: radius`);
  assert.equal(result.validGPS, expectedGPS, `${name}: GPS domain`);

  console.log(`PASS: ${name}`);
}

console.log("5/5 GEOGRAPHIC BOUNDARY TESTS PASSED");
console.log("NOTE: These tests model intended boundaries; they do not execute Circom.");
