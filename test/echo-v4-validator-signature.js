const { expect } = require("chai");
const hre = require("hardhat");

describe("Echo V4 Validator Signature Binding", function () {
  it("accepts a correctly signed checkpoint", async function () {
    const [account, validator] = await hre.ethers.getSigners();

    const Registry = await hre.ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );

    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Mock = await hre.ethers.getContractFactory(
      "EchoAuthorizationBridgeV4TestHarness"
    );

    const bridge = await Mock.deploy(
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
      timestamp: Math.floor(Date.now() / 1000),
      nonce: 1
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

    const signals = Array(20).fill(0n);
    signals[5] = BigInt(validator.address);

    await bridge.exposedValidateValidatorSignature(
      checkpoint,
      signature,
      signals
    );

    expect(signature).to.have.length(132);
  });

  it("rejects a mismatched validator identity", async function () {
    const assert = require("node:assert/strict");
    const [account, validator, wrongValidator] =
      await hre.ethers.getSigners();

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

    const checkpoint = {
      account: account.address,
      delegatee: account.address,
      zoneHash: hre.ethers.keccak256(
        hre.ethers.toUtf8Bytes("test-zone")
      ),
      checkpointCommitment: hre.ethers.ZeroHash,
      authorizationCommitment: hre.ethers.ZeroHash,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: 2
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

    const signals = Array(20).fill(0n);
    signals[5] = BigInt(wrongValidator.address);

    await assert.rejects(
      bridge.exposedValidateValidatorSignature(
        checkpoint,
        signature,
        signals
      )
    );
  });


  it("rejects a corrupted checkpoint signature", async function () {
    const assert = require("node:assert/strict");
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

    const checkpoint = {
      account: account.address,
      delegatee: account.address,
      zoneHash: hre.ethers.keccak256(
        hre.ethers.toUtf8Bytes("test-zone")
      ),
      checkpointCommitment: hre.ethers.ZeroHash,
      authorizationCommitment: hre.ethers.ZeroHash,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: 3
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

    // Remove one byte, making the signature malformed.
    const corruptedSignature = "0x" + signature.slice(2, -2);

    const signals = Array(20).fill(0n);
    signals[5] = BigInt(validator.address);

    await assert.rejects(
      bridge.exposedValidateValidatorSignature(
        checkpoint,
        corruptedSignature,
        signals
      )
    );
  });


  it("rejects a modified checkpoint after signing", async function () {
    const assert = require("node:assert/strict");
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

    const checkpoint = {
      account: account.address,
      delegatee: account.address,
      zoneHash: hre.ethers.keccak256(
        hre.ethers.toUtf8Bytes("test-zone")
      ),
      checkpointCommitment: hre.ethers.ZeroHash,
      authorizationCommitment: hre.ethers.ZeroHash,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: 4
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

    const signals = Array(20).fill(0n);
    signals[5] = BigInt(validator.address);

    // First confirm the original signed checkpoint is accepted.
    await bridge.exposedValidateValidatorSignature(
      checkpoint,
      signature,
      signals
    );

    // Change the nonce after signing.
    const tamperedCheckpoint = {
      ...checkpoint,
      nonce: 999
    };

    // The original signature must not validate the modified checkpoint.
    await assert.rejects(
      bridge.exposedValidateValidatorSignature(
        tamperedCheckpoint,
        signature,
        signals
      )
    );
  });


  it("rejects a signature from a different registry", async function () {
    const assert = require("node:assert/strict");
    const [account, validator] = await hre.ethers.getSigners();

    const Registry = await hre.ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );

    const registryA = await Registry.deploy();
    const registryB = await Registry.deploy();

    await registryA.waitForDeployment();
    await registryB.waitForDeployment();

    const Bridge = await hre.ethers.getContractFactory(
      "EchoAuthorizationBridgeV4TestHarness"
    );

    const bridge = await Bridge.deploy(
      await registryB.getAddress(),
      await registryB.getAddress()
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
      timestamp: Math.floor(Date.now() / 1000),
      nonce: 5
    };

    const network = await hre.ethers.provider.getNetwork();

    const domain = {
      name: "EchoAttestationRegistryV3",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await registryA.getAddress()
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

    const signals = Array(20).fill(0n);
    signals[5] = BigInt(validator.address);

    // Signature was created for Registry A.
    // Bridge validates against Registry B.
    await assert.rejects(
      bridge.exposedValidateValidatorSignature(
        checkpoint,
        signature,
        signals
      )
    );
  });

});
