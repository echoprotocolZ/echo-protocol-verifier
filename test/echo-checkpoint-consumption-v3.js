const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Echo V3 checkpoint consumption", function () {
  let registry, account, delegatee, validator, outsider;
  let checkpoint;

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

  async function signCheckpoint(signer) {
    const network = await ethers.provider.getNetwork();

    return signer.signTypedData(
      {
        name: "EchoAttestationRegistryV3",
        version: "1",
        chainId: network.chainId,
        verifyingContract: await registry.getAddress()
      },
      types,
      checkpoint
    );
  }

  async function expectError(promise, name) {
    try {
      await promise;
      expect.fail("Expected " + name);
    } catch (error) {
      if (error.message.startsWith("Expected ")) throw error;
      expect(error.message).to.include(name);
    }
  }

  beforeEach(async function () {
    [account, delegatee, validator, outsider] =
      await ethers.getSigners();

    const Factory = await ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );

    registry = await Factory.deploy();
    await registry.waitForDeployment();

    const block = await ethers.provider.getBlock("latest");

    checkpoint = {
      account: account.address,
      delegatee: delegatee.address,
      zoneHash: ethers.id("approved-zone"),
      checkpointCommitment: ethers.id("checkpoint"),
      authorizationCommitment: ethers.id("authorization"),
      timestamp: BigInt(block.timestamp),
      nonce: 1n
    };

    await registry.connect(account).setAttestationPolicy(
      delegatee.address,
      {
        allowedZoneHash: checkpoint.zoneHash,
        maxTimeDrift: 300,
        requiredTier: 0,
        allowValidatorFallback: false,
        enabled: true
      }
    );

    await registry.connect(account).setValidatorSigner(
      validator.address,
      true
    );
  });

  it("consumes a valid signed checkpoint", async function () {
    const signature = await signCheckpoint(validator);
    const digest = await registry.checkpointDigest(checkpoint);

    await (
      await registry.connect(account).consumeCheckpoint(
        checkpoint, signature
      )
    ).wait();

    expect(await registry.consumedCheckpoints(digest))
      .to.equal(true);
  });

  it("rejects replay of the same checkpoint", async function () {
    const signature = await signCheckpoint(validator);

    await (
      await registry.connect(account).consumeCheckpoint(
        checkpoint, signature
      )
    ).wait();

    await expectError(
      registry.connect(account).consumeCheckpoint(
        checkpoint, signature
      ),
      "CheckpointAlreadyConsumed"
    );
  });

  it("rejects an unauthorized consumer", async function () {
    const signature = await signCheckpoint(validator);

    await expectError(
      registry.connect(outsider).consumeCheckpoint(
        checkpoint, signature
      ),
      "UnauthorizedCheckpointConsumer"
    );
  });

  it("rejects a revoked validator", async function () {
    const signature = await signCheckpoint(validator);

    await registry.connect(account).setValidatorSigner(
      validator.address,
      false
    );

    await expectError(
      registry.connect(account).consumeCheckpoint(
        checkpoint, signature
      ),
      "UntrustedCheckpointSigner"
    );
  });

  it("rejects an unsupported hardware-strict tier", async function () {
    await registry.connect(account).setAttestationPolicy(
      delegatee.address,
      {
        allowedZoneHash: checkpoint.zoneHash,
        maxTimeDrift: 300,
        requiredTier: 2,
        allowValidatorFallback: false,
        enabled: true
      }
    );

    const signature = await signCheckpoint(validator);

    await expectError(
      registry.connect(account).consumeCheckpoint(
        checkpoint, signature
      ),
      "UnsupportedAttestationTier"
    );
  });

  it("rejects a checkpoint with the wrong zone", async function () {
    checkpoint.zoneHash = ethers.id("wrong-zone");

    const signature = await signCheckpoint(validator);

    await expectError(
      registry.connect(account).consumeCheckpoint(
        checkpoint, signature
      ),
      "CheckpointZoneMismatch"
    );
  });
});

describe("Echo V3 nonce uniqueness", function () {
  it("rejects a different checkpoint using an already-consumed nonce", async function () {
    const [account, delegatee, validator] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );
    const registry = await Factory.deploy();
    await registry.waitForDeployment();

    const block = await ethers.provider.getBlock("latest");
    const zone = ethers.id("nonce-test-zone");

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

    await registry.connect(account).setValidatorSigner(
      validator.address, true
    );

    const checkpoint = {
      account: account.address,
      delegatee: delegatee.address,
      zoneHash: zone,
      checkpointCommitment: ethers.id("checkpoint-one"),
      authorizationCommitment: ethers.id("authorization-one"),
      timestamp: BigInt(block.timestamp),
      nonce: 42n
    };

    const network = await ethers.provider.getNetwork();
    const domain = {
      name: "EchoAttestationRegistryV3",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await registry.getAddress()
    };

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

    const signature1 = await validator.signTypedData(
      domain, types, checkpoint
    );

    await (
      await registry.connect(account).consumeCheckpoint(
        checkpoint, signature1
      )
    ).wait();

    expect(
      await registry.consumedCheckpointNonces(
        account.address, delegatee.address, 42n
      )
    ).to.equal(true);

    const changed = {
      ...checkpoint,
      checkpointCommitment: ethers.id("checkpoint-two"),
      authorizationCommitment: ethers.id("authorization-two")
    };

    const signature2 = await validator.signTypedData(
      domain, types, changed
    );

    let rejected = false;
    try {
      await registry.connect(account).consumeCheckpoint(
        changed, signature2
      );
    } catch (error) {
      rejected = error.message.includes("CheckpointAlreadyConsumed");
    }

    expect(rejected).to.equal(true);
  });
});
