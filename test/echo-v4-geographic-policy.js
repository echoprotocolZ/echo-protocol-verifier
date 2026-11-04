const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO V4 Geographic Policy Registry", function () {
  let registry, owner, attacker, delegatee;

  const zone = {
    minLat: 1200000000,
    maxLat: 1210000000,
    minLon: 2400000000,
    maxLon: 2410000000
  };

  const approvedHash =
    "0x351fef11f411f9973897eee6e2c821709da44bfe42550eb7c7b22d0d9a6c6a69";

  beforeEach(async function () {
    [owner, attacker, delegatee] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory(
      "EchoGeographicPolicyRegistryV4"
    );

    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  it("allows account to register an approved zone", async function () {
    await registry.connect(owner).setGeographicPolicy(
      delegatee.address, zone
    );

    const policy = await registry.getGeographicPolicy(
      owner.address, delegatee.address
    );

    assert.equal(policy.zoneHash, approvedHash);
    assert.equal(policy.enabled, true);
  });

  it("validates the approved zone", async function () {
    await registry.connect(owner).setGeographicPolicy(
      delegatee.address, zone
    );

    assert.equal(
      await registry.validateApprovedZone(
        owner.address, delegatee.address, approvedHash
      ),
      true
    );
  });

  it("rejects an unapproved zone hash", async function () {
    await registry.connect(owner).setGeographicPolicy(
      delegatee.address, zone
    );

    await assert.rejects(
      registry.validateApprovedZone(
        owner.address, delegatee.address, ethers.ZeroHash
      )
    );
  });

  it("prevents another account from overwriting owner's policy", async function () {
    await registry.connect(owner).setGeographicPolicy(
      delegatee.address, zone
    );

    await registry.connect(attacker).setGeographicPolicy(
      delegatee.address,
      { ...zone, maxLat: 1210000001 }
    );

    const policy = await registry.getGeographicPolicy(
      owner.address, delegatee.address
    );

    assert.equal(policy.zoneHash, approvedHash);
  });

  it("allows owner to update geographic boundaries", async function () {
    await registry.connect(owner).setGeographicPolicy(
      delegatee.address, zone
    );

    await registry.connect(owner).setGeographicPolicy(
      delegatee.address,
      { ...zone, maxLat: 1210000001 }
    );

    const policy = await registry.getGeographicPolicy(
      owner.address, delegatee.address
    );

    assert.notEqual(policy.zoneHash, approvedHash);
    assert.equal(policy.enabled, true);
  });

  it("rejects disabled geographic policies", async function () {
    await registry.connect(owner).setGeographicPolicy(
      delegatee.address, zone
    );

    await registry.connect(owner).disableGeographicPolicy(
      delegatee.address
    );

    await assert.rejects(
      registry.validateApprovedZone(
        owner.address, delegatee.address, approvedHash
      )
    );
  });

  it("rejects policies that were never registered", async function () {
    await assert.rejects(
      registry.validateApprovedZone(
        owner.address, delegatee.address, approvedHash
      )
    );
  });

  it("rejects a zero-address delegatee", async function () {
    await assert.rejects(
      registry.connect(owner).setGeographicPolicy(
        ethers.ZeroAddress, zone
      )
    );
  });
});
