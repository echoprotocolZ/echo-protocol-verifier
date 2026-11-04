const assert = require("node:assert/strict");
const hre = require("hardhat");

describe("Echo V4 Checkpoint Consumption Security", function () {
  it("rejects a bridge not authorized by the account", async function () {
    const [account] = await hre.ethers.getSigners();

    const Registry = await hre.ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Bridge = await hre.ethers.getContractFactory(
      "EchoAuthorizationBridgeV4TestHarness"
    );

    // The registry address is used as a placeholder for the verifier
    // only in this isolated registry-permission test.
    const bridge = await Bridge.deploy(
      await registry.getAddress(),
      await registry.getAddress()
    );
    await bridge.waitForDeployment();

    const checkpoint = {
      account: account.address,
      delegatee: account.address,
      zoneHash: hre.ethers.keccak256(
        hre.ethers.toUtf8Bytes("test-zone")
      ),
      checkpointCommitment: hre.ethers.ZeroHash,
      authorizationCommitment: hre.ethers.ZeroHash,
      timestamp: BigInt(
        (await hre.ethers.provider.getBlock("latest")).timestamp
      ),
      nonce: 1n
    };

    const authorized = await registry.authorizedCheckpointBridges(
      account.address,
      await bridge.getAddress()
    );

    assert.equal(authorized, false);

    const registryError = new hre.ethers.Interface([
      "error UnauthorizedCheckpointConsumer()"
    ]);

    const expectedSelector = registryError.getError(
      "UnauthorizedCheckpointConsumer"
    ).selector;

    await assert.rejects(
      bridge.exposedConsumeAuthenticatedCheckpoint(
        checkpoint,
        "0x"
      ),
      (error) => {
        const data =
          error.data ??
          error.error?.data ??
          error.info?.error?.data;

        assert.equal(
          data?.slice(0, 10),
          expectedSelector,
          "Expected UnauthorizedCheckpointConsumer revert"
        );

        return true;
      }
    );
  });

  it("rejects a checkpoint signed by an untrusted validator", async function () {
    const [account, validator] = await hre.ethers.getSigners();

    const Registry = await hre.ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Bridge = await hre.ethers.getContractFactory(
      "EchoAuthorizationBridgeV4TestHarness"
    );
    const bridge = await Bridge.deploy(
      await registry.getAddress(),
      await registry.getAddress()
    );
    await bridge.waitForDeployment();

    // The account authorizes the bridge, but not the validator.
    await (
      await registry.connect(account).setCheckpointBridge(
        await bridge.getAddress(),
        true
      )
    ).wait();

    assert.equal(
      await registry.authorizedCheckpointBridges(
        account.address,
        await bridge.getAddress()
      ),
      true
    );

    assert.equal(
      await registry.trustedValidatorSigners(
        account.address,
        validator.address
      ),
      false
    );

    const checkpoint = {
      account: account.address,
      delegatee: account.address,
      zoneHash: hre.ethers.keccak256(
        hre.ethers.toUtf8Bytes("test-zone")
      ),
      checkpointCommitment: hre.ethers.ZeroHash,
      authorizationCommitment: hre.ethers.ZeroHash,
      timestamp: BigInt(
        (await hre.ethers.provider.getBlock("latest")).timestamp
      ),
      nonce: 2n
    };

    const network = await hre.ethers.provider.getNetwork();

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

    const signature = await validator.signTypedData(
      domain,
      types,
      checkpoint
    );

    // Configure the policy so the test reaches the signer check.
    await (
      await registry.connect(account).setAttestationPolicy(
        account.address,
        {
          requiredTier: 0,
          allowedZoneHash: checkpoint.zoneHash,
          maxTimeDrift: 3600,
          allowValidatorFallback: false,
          enabled: true
        }
      )
    ).wait();

    const expectedSelector = new hre.ethers.Interface([
      "error UntrustedCheckpointSigner()"
    ]).getError("UntrustedCheckpointSigner").selector;

    await assert.rejects(
      bridge.exposedConsumeAuthenticatedCheckpoint(
        checkpoint,
        signature
      ),
      (error) => {
        const data =
          error.data ??
          error.error?.data ??
          error.info?.error?.data;

        assert.equal(
          data?.slice(0, 10),
          expectedSelector,
          "Expected UntrustedCheckpointSigner revert"
        );

        return true;
      }
    );
  });


  it("rejects replay of an already consumed checkpoint", async function () {
    const [account, validator] = await hre.ethers.getSigners();

    const Registry = await hre.ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Bridge = await hre.ethers.getContractFactory(
      "EchoAuthorizationBridgeV4TestHarness"
    );
    const bridge = await Bridge.deploy(
      await registry.getAddress(),
      await registry.getAddress()
    );
    await bridge.waitForDeployment();

    const bridgeAddress = await bridge.getAddress();

    await (
      await registry.connect(account).setCheckpointBridge(
        bridgeAddress, true
      )
    ).wait();

    await (
      await registry.connect(account).setValidatorSigner(
        validator.address, true
      )
    ).wait();

    const zoneHash = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes("replay-test-zone")
    );

    await (
      await registry.connect(account).setAttestationPolicy(
        account.address,
        {
          allowedZoneHash: zoneHash,
          maxTimeDrift: 3600,
          requiredTier: 0,
          allowValidatorFallback: false,
          enabled: true
        }
      )
    ).wait();

    const checkpoint = {
      account: account.address,
      delegatee: account.address,
      zoneHash,
      checkpointCommitment: hre.ethers.ZeroHash,
      authorizationCommitment: hre.ethers.ZeroHash,
      timestamp: BigInt(
        (await hre.ethers.provider.getBlock("latest")).timestamp
      ),
      nonce: 100n
    };

    const network = await hre.ethers.provider.getNetwork();

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

    const signature = await validator.signTypedData(
      domain, types, checkpoint
    );

    // First consumption should succeed.
    await (
      await bridge.exposedConsumeAuthenticatedCheckpoint(
        checkpoint, signature
      )
    ).wait();

    const digest = await registry.checkpointDigest(checkpoint);

    assert.equal(
      await registry.consumedCheckpoints(digest),
      true,
      "Checkpoint digest should be marked consumed"
    );

    assert.equal(
      await registry.consumedCheckpointNonces(
        account.address,
        account.address,
        checkpoint.nonce
      ),
      true,
      "Checkpoint nonce should be marked consumed"
    );

    // Reusing the exact same checkpoint must fail.
    const expectedSelector = new hre.ethers.Interface([
      "error CheckpointAlreadyConsumed()"
    ]).getError("CheckpointAlreadyConsumed").selector;

    await assert.rejects(
      bridge.exposedConsumeAuthenticatedCheckpoint(
        checkpoint, signature
      ),
      (error) => {
        const data =
          error.data ??
          error.error?.data ??
          error.info?.error?.data;

        assert.equal(
          data?.slice(0, 10),
          expectedSelector,
          "Expected CheckpointAlreadyConsumed revert"
        );

        return true;
      }
    );
  });


  it("rejects a different checkpoint reusing a consumed nonce", async function () {
    const [account, validator] = await hre.ethers.getSigners();

    const Registry = await hre.ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Bridge = await hre.ethers.getContractFactory(
      "EchoAuthorizationBridgeV4TestHarness"
    );
    const bridge = await Bridge.deploy(
      await registry.getAddress(),
      await registry.getAddress()
    );
    await bridge.waitForDeployment();

    await (
      await registry.connect(account).setCheckpointBridge(
        await bridge.getAddress(), true
      )
    ).wait();

    await (
      await registry.connect(account).setValidatorSigner(
        validator.address, true
      )
    ).wait();

    const zoneHash = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes("nonce-reuse-test-zone")
    );

    await (
      await registry.connect(account).setAttestationPolicy(
        account.address,
        {
          allowedZoneHash: zoneHash,
          maxTimeDrift: 3600,
          requiredTier: 0,
          allowValidatorFallback: false,
          enabled: true
        }
      )
    ).wait();

    const checkpoint = {
      account: account.address,
      delegatee: account.address,
      zoneHash,
      checkpointCommitment: hre.ethers.ZeroHash,
      authorizationCommitment: hre.ethers.ZeroHash,
      timestamp: BigInt(
        (await hre.ethers.provider.getBlock("latest")).timestamp
      ),
      nonce: 200n
    };

    const network = await hre.ethers.provider.getNetwork();

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

    const signature = await validator.signTypedData(
      domain, types, checkpoint
    );

    await (
      await bridge.exposedConsumeAuthenticatedCheckpoint(
        checkpoint, signature
      )
    ).wait();

    const modifiedCheckpoint = {
      ...checkpoint,
      authorizationCommitment: hre.ethers.keccak256(
        hre.ethers.toUtf8Bytes("different-authorization")
      )
    };

    const modifiedSignature = await validator.signTypedData(
      domain, types, modifiedCheckpoint
    );

    const originalDigest = await registry.checkpointDigest(checkpoint);
    const modifiedDigest = await registry.checkpointDigest(
      modifiedCheckpoint
    );

    assert.notEqual(
      originalDigest,
      modifiedDigest,
      "The two checkpoints must have different digests"
    );

    assert.equal(
      await registry.consumedCheckpoints(modifiedDigest),
      false,
      "The modified checkpoint must not already be consumed"
    );

    const expectedSelector = new hre.ethers.Interface([
      "error CheckpointAlreadyConsumed()"
    ]).getError("CheckpointAlreadyConsumed").selector;

    await assert.rejects(
      bridge.exposedConsumeAuthenticatedCheckpoint(
        modifiedCheckpoint, modifiedSignature
      ),
      (error) => {
        const data =
          error.data ??
          error.error?.data ??
          error.info?.error?.data;

        assert.equal(
          data?.slice(0, 10),
          expectedSelector,
          "Expected CheckpointAlreadyConsumed revert"
        );

        return true;
      }
    );

    assert.equal(
      await registry.consumedCheckpoints(modifiedDigest),
      false,
      "Rejected checkpoint must remain unconsumed"
    );
  });


  it("rejects checkpoint replay across two authorized bridges", async function () {
    const [account, validator] = await hre.ethers.getSigners();

    const Registry = await hre.ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Bridge = await hre.ethers.getContractFactory(
      "EchoAuthorizationBridgeV4TestHarness"
    );

    const registryAddress = await registry.getAddress();

    const bridgeA = await Bridge.deploy(
      registryAddress, registryAddress
    );
    const bridgeB = await Bridge.deploy(
      registryAddress, registryAddress
    );

    await bridgeA.waitForDeployment();
    await bridgeB.waitForDeployment();

    await (
      await registry.connect(account).setCheckpointBridge(
        await bridgeA.getAddress(), true
      )
    ).wait();

    await (
      await registry.connect(account).setCheckpointBridge(
        await bridgeB.getAddress(), true
      )
    ).wait();

    await (
      await registry.connect(account).setValidatorSigner(
        validator.address, true
      )
    ).wait();

    const zoneHash = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes("cross-bridge-zone")
    );

    await (
      await registry.connect(account).setAttestationPolicy(
        account.address,
        {
          allowedZoneHash: zoneHash,
          maxTimeDrift: 3600,
          requiredTier: 0,
          allowValidatorFallback: false,
          enabled: true
        }
      )
    ).wait();

    const checkpoint = {
      account: account.address,
      delegatee: account.address,
      zoneHash,
      checkpointCommitment: hre.ethers.ZeroHash,
      authorizationCommitment: hre.ethers.ZeroHash,
      timestamp: BigInt(
        (await hre.ethers.provider.getBlock("latest")).timestamp
      ),
      nonce: 300n
    };

    const network = await hre.ethers.provider.getNetwork();

    const domain = {
      name: "EchoAttestationRegistryV3",
      version: "1",
      chainId: network.chainId,
      verifyingContract: registryAddress
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

    const signature = await validator.signTypedData(
      domain, types, checkpoint
    );

    // Bridge A consumes the checkpoint successfully.
    await (
      await bridgeA.exposedConsumeAuthenticatedCheckpoint(
        checkpoint, signature
      )
    ).wait();

    const digest = await registry.checkpointDigest(checkpoint);

    assert.equal(
      await registry.consumedCheckpoints(digest),
      true
    );

    // Bridge B must not be able to consume it again.
    const expectedSelector = new hre.ethers.Interface([
      "error CheckpointAlreadyConsumed()"
    ]).getError("CheckpointAlreadyConsumed").selector;

    await assert.rejects(
      bridgeB.exposedConsumeAuthenticatedCheckpoint(
        checkpoint, signature
      ),
      (error) => {
        const data =
          error.data ??
          error.error?.data ??
          error.info?.error?.data;

        assert.equal(
          data?.slice(0, 10),
          expectedSelector,
          "Expected cross-bridge replay rejection"
        );

        return true;
      }
    );
  });

});
