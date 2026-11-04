const assert = require("node:assert/strict");

const LAT_MAX = 1800000000n;
const LON_MAX = 3600000000n;

function validCoordinate(lat, lon) {
  return lat >= 0n && lat <= LAT_MAX &&
         lon >= 0n && lon <= LON_MAX;
}

function insideZone(lat, lon, zone) {
  const [minLat, maxLat, minLon, maxLon] = zone;

  if (!validCoordinate(lat, lon)) return false;

  if (!validCoordinate(minLat, minLon)) return false;
  if (!validCoordinate(maxLat, maxLon)) return false;

  if (minLat > maxLat || minLon > maxLon) return false;

  return lat >= minLat && lat <= maxLat &&
         lon >= minLon && lon <= maxLon;
}

const zone = [
  1200000000n,
  1210000000n,
  2400000000n,
  2410000000n
];

const cases = [
  ["Inside zone", 1205000000n, 2405000000n, true],
  ["On minimum boundary", 1200000000n, 2400000000n, true],
  ["On maximum boundary", 1210000000n, 2410000000n, true],
  ["Outside latitude", 1210000001n, 2405000000n, false],
  ["Outside longitude", 1205000000n, 2410000001n, false],
  ["Invalid GPS latitude", 1800000001n, 2405000000n, false],
  ["Invalid GPS longitude", 1205000000n, 3600000001n, false]
];

for (const [name, lat, lon, expected] of cases) {
  assert.equal(insideZone(lat, lon, zone), expected, name);
  console.log(`PASS: ${name}`);
}

assert.equal(
  insideZone(1205000000n, 2405000000n,
    [1210000000n, 1200000000n, 2400000000n, 2410000000n]),
  false
);

console.log("PASS: Reversed zone boundaries");
console.log("8/8 V4 GEOGRAPHIC ZONE TESTS PASSED");
