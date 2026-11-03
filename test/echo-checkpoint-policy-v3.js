const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Echo V3 checkpoint policy validation", function () {
  let registry, account, delegatee, checkpoint;
  const zone = ethers.id("approved-zone");

  beforeEach(async function () {
    [account, delegatee] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );
    registry = await Factory.deploy();
    await registry.waitForDeployment();

    const block = await ethers.provider.getBlock("latest");

    checkpoint = {
      account: account.address,
      delegatee: delegatee.address,
      zoneHash: zone,
      checkpointCommitment: ethers.id("checkpoint"),
      authorizationCommitment: ethers.id("authorization"),
      timestamp: BigInt(block.timestamp),
      nonce: 1n
    };

    await registry.connect(account).setAttestationPolicy(
      delegatee.address,
      {
        allowedZoneHash: zone,
        maxTimeDrift: 300,
        requiredTier: 0,
        allowValidatorFallback: false,
        enabled: true
      }
    );
  });

  async function expectError(promise, errorName) {
    try {
      await promise;
      expect.fail("Expected " + errorName);
    } catch (error) {
      if (error.message.startsWith("Expected ")) throw error;
      expect(error.message).to.include(errorName);
    }
  }

  it("accepts a recent checkpoint", async function () {
    expect(
      await registry.validateCheckpointPolicy(checkpoint)
    ).to.equal(0n);
  });

  it("rejects an expired checkpoint", async function () {
    const block = await ethers.provider.getBlock("latest");
    checkpoint.timestamp = BigInt(block.timestamp - 301);

    await expectError(
      registry.validateCheckpointPolicy(checkpoint),
      "CheckpointTimestampInvalid"
    );
  });

  it("rejects a future checkpoint", async function () {
    const block = await ethers.provider.getBlock("latest");
    checkpoint.timestamp = BigInt(block.timestamp + 600);

    await expectError(
      registry.validateCheckpointPolicy(checkpoint),
      "CheckpointTimestampInvalid"
    );
  });

  it("rejects an incorrect geographic zone", async function () {
    checkpoint.zoneHash = ethers.id("wrong-zone");

    await expectError(
      registry.validateCheckpointPolicy(checkpoint),
      "CheckpointZoneMismatch"
    );
  });

  it("rejects a disabled policy", async function () {
    await registry.connect(account).setAttestationPolicy(
      delegatee.address,
      {
        allowedZoneHash: zone,
        maxTimeDrift: 300,
        requiredTier: 0,
        allowValidatorFallback: false,
        enabled: false
      }
    );

    await expectError(
      registry.validateCheckpointPolicy(checkpoint),
      "AttestationPolicyDisabled"
    );
  });

  it("accepts a checkpoint exactly at the drift limit", async function () {
    const block = await ethers.provider.getBlock("latest");
    checkpoint.timestamp = BigInt(block.timestamp - 300);

    expect(
      await registry.validateCheckpointPolicy(checkpoint)
    ).to.equal(0n);
  });
});
