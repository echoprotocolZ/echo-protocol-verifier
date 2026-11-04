const assert = require("node:assert/strict");
const { ethers } = require("ethers");

const DOMAIN = ethers.id("ECHO_V4_GEOGRAPHIC_ZONE_V1");

function zoneHash(zone) {
  const { minLat, maxLat, minLon, maxLon } = zone;

  for (const [name, value, maximum] of [
    ["minLat", minLat, 1800000000n],
    ["maxLat", maxLat, 1800000000n],
    ["minLon", minLon, 3600000000n],
    ["maxLon", maxLon, 3600000000n]
  ]) {
    assert(typeof value === "bigint", `${name} must be bigint`);
    assert(value >= 0n && value <= maximum, `${name} out of range`);
  }

  assert(minLat <= maxLat, "Invalid latitude boundaries");
  assert(minLon <= maxLon, "Invalid longitude boundaries");

  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint32", "uint32", "uint32", "uint32"],
      [DOMAIN, minLat, maxLat, minLon, maxLon]
    )
  );
}

const approved = {
  minLat: 1200000000n,
  maxLat: 1210000000n,
  minLon: 2400000000n,
  maxLon: 2410000000n
};

const hash = zoneHash(approved);

assert.equal(hash, zoneHash({ ...approved }));
console.log("PASS: Identical zones produce identical hashes");

for (const field of Object.keys(approved)) {
  const modified = { ...approved, [field]: approved[field] + 1n };
  assert.notEqual(hash, zoneHash(modified));
  console.log(`PASS: Changing ${field} changes the zone hash`);
}

assert.throws(() => zoneHash({
  ...approved,
  minLat: 1800000001n
}));
console.log("PASS: Invalid GPS latitude rejected");

assert.throws(() => zoneHash({
  ...approved,
  minLat: 1210000001n
}));
console.log("PASS: Reversed latitude boundaries rejected");

assert.throws(() => zoneHash({
  ...approved,
  minLon: 2410000001n
}));
console.log("PASS: Reversed longitude boundaries rejected");

console.log("APPROVED ZONE HASH:", hash);
console.log("8/8 V4 ZONE HASH TESTS PASSED");
