const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO V4 Zone Hash Security", function () {
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

  it("accepts the approved zone", async function () {
    const result = await harness.hashZone(zone);
    assert.equal(
      result,
      "0x351fef11f411f9973897eee6e2c821709da44bfe42550eb7c7b22d0d9a6c6a69"
    );
  });

  for (const field of Object.keys(zone)) {
    it(`detects modification of ${field}`, async function () {
      const changed = {
        ...zone,
        [field]: zone[field] + 1
      };

      const originalHash = await harness.hashZone(zone);
      const changedHash = await harness.hashZone(changed);

      assert.notEqual(originalHash, changedHash);
    });
  }

  for (const field of ["minLat", "maxLat"]) {
    it(`rejects invalid ${field}`, async function () {
      await assert.rejects(
        harness.hashZone({
          ...zone,
          [field]: 1800000001
        })
      );
    });
  }

  for (const field of ["minLon", "maxLon"]) {
    it(`rejects invalid ${field}`, async function () {
      await assert.rejects(
        harness.hashZone({
          ...zone,
          [field]: 3600000001
        })
      );
    });
  }

  it("rejects reversed latitude boundaries", async function () {
    await assert.rejects(
      harness.hashZone({
        ...zone,
        minLat: 1210000001
      })
    );
  });

  it("rejects reversed longitude boundaries", async function () {
    await assert.rejects(
      harness.hashZone({
        ...zone,
        minLon: 2410000001
      })
    );
  });
});
