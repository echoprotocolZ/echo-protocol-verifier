const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EchoAttestationRegistryV3 EIP-712 digest", function () {
  let registry, account, delegatee;

  const types = {
    SignedCheckpoint: [
      { name: "account", type: "address" },
      { name: "delegatee", type: "address" },
      { name: "zoneHash", type: "bytes32" },
      { name: "checkpointCommitment", type: "bytes32" },
      { name: "authorizationCommitment", type: "bytes32" },
      { name: "timestamp", type: "uint64" },
      { name: "nonce", type: "uint256" }
    ]
  };

  beforeEach(async function () {
    [account, delegatee] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  it("matches the standard EIP-712 digest", async function () {
    const network = await ethers.provider.getNetwork();

    const checkpoint = {
      account: account.address,
      delegatee: delegatee.address,
      zoneHash: ethers.id("zone-a"),
      checkpointCommitment: ethers.id("checkpoint-a"),
      authorizationCommitment: ethers.id("authorization-a"),
      timestamp: 1700000000n,
      nonce: 1n
    };

    const domain = {
      name: "EchoAttestationRegistryV3",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await registry.getAddress()
    };

    const expected = ethers.TypedDataEncoder.hash(
      domain,
      types,
      checkpoint
    );

    expect(await registry.checkpointDigest(checkpoint))
      .to.equal(expected);
  });

  it("changes digest when any checkpoint field changes", async function () {
    const checkpoint = {
      account: account.address,
      delegatee: delegatee.address,
      zoneHash: ethers.id("zone-a"),
      checkpointCommitment: ethers.id("checkpoint-a"),
      authorizationCommitment: ethers.id("authorization-a"),
      timestamp: 1700000000n,
      nonce: 1n
    };

    const original = await registry.checkpointDigest(checkpoint);

    const changes = {
      account: delegatee.address,
      delegatee: account.address,
      zoneHash: ethers.id("zone-b"),
      checkpointCommitment: ethers.id("checkpoint-b"),
      authorizationCommitment: ethers.id("authorization-b"),
      timestamp: 1700000001n,
      nonce: 2n
    };

    for (const [field, value] of Object.entries(changes)) {
      const changed = { ...checkpoint, [field]: value };
      expect(
        await registry.checkpointDigest(changed),
        field
      ).to.not.equal(original);
    }
  });

  it("binds digest to the verifying contract", async function () {
    const Factory = await ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );

    const otherRegistry = await Factory.deploy();
    await otherRegistry.waitForDeployment();

    const checkpoint = {
      account: account.address,
      delegatee: delegatee.address,
      zoneHash: ethers.id("zone-a"),
      checkpointCommitment: ethers.id("checkpoint-a"),
      authorizationCommitment: ethers.id("authorization-a"),
      timestamp: 1700000000n,
      nonce: 1n
    };

    expect(await registry.checkpointDigest(checkpoint))
      .to.not.equal(
        await otherRegistry.checkpointDigest(checkpoint)
      );
  });
});
