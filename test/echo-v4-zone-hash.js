const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO V4 Geographic Zone Hash", function () {
  let harness;

  const zone = {
    minLat: 1200000000,
    maxLat: 1210000000,
    minLon: 2400000000,
    maxLon: 2410000000
  };

  before(async function () {
    const Factory = await ethers.getContractFactory(
      "EchoGeographicZoneV4Harness"
    );
    harness = await Factory.deploy();
    await harness.waitForDeployment();
  });

  it("matches the JavaScript approved-zone hash", async function () {
    const expected =
      "0x351fef11f411f9973897eee6e2c821709da44bfe42550eb7c7b22d0d9a6c6a69";

    const actual = await harness.hashZone(zone);

    assert.equal(actual, expected);
  });

  it("rejects invalid latitude", async function () {
    await assert.rejects(
      harness.hashZone({ ...zone, minLat: 1800000001 })
    );
  });

  it("rejects reversed latitude boundaries", async function () {
    await assert.rejects(
      harness.hashZone({ ...zone, minLat: 1210000001 })
    );
  });

  it("rejects reversed longitude boundaries", async function () {
    await assert.rejects(
      harness.hashZone({ ...zone, minLon: 2410000001 })
    );
  });

  it("changes hash when a boundary changes", async function () {
    const original = await harness.hashZone(zone);
    const changed = await harness.hashZone({
      ...zone,
      maxLat: 1210000001
    });

    assert.notEqual(original, changed);
  });
});
