"use strict";
// Local-only EIP-712 checkpoint authenticity regression; no live chain or proof artifacts.
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

describe("ECHO checkpoint signature authenticity (local-only)", function () {
  it("accepts a trusted typed-data signature and rejects tampering, wrong signer and wrong domain", async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    const [account, delegatee, validator, attacker] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    await registry.waitForDeployment();
    await (await registry.connect(account).setValidatorSigner(validator.address, true)).wait();

    const checkpoint = {
      account: account.address,
      delegatee: delegatee.address,
      zoneHash: ethers.keccak256(ethers.toUtf8Bytes("zone:trusted")),
      checkpointCommitment: ethers.keccak256(ethers.toUtf8Bytes("checkpoint:trusted")),
      authorizationCommitment: ethers.keccak256(ethers.toUtf8Bytes("authorization:trusted")),
      timestamp: BigInt((await ethers.provider.getBlock("latest")).timestamp),
      nonce: 7n
    };
    const domain = {
      name: "EchoAttestationRegistryV3",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: registry.target
    };
    const types = { SignedCheckpoint: [
      { name: "account", type: "address" },
      { name: "delegatee", type: "address" },
      { name: "zoneHash", type: "bytes32" },
      { name: "checkpointCommitment", type: "bytes32" },
      { name: "authorizationCommitment", type: "bytes32" },
      { name: "timestamp", type: "uint64" },
      { name: "nonce", type: "uint256" }
    ] };
    const signature = await validator.signTypedData(domain, types, checkpoint);
    assert.equal(await registry.verifyCheckpointSigner(checkpoint, signature, 0), validator.address);
    const baselineDigest = await registry.checkpointDigest(checkpoint);
    assert.equal(ethers.verifyTypedData(domain, types, checkpoint, signature), validator.address);
    const tampered = [
      { ...checkpoint, nonce: 8n },
      { ...checkpoint, delegatee: attacker.address },
      { ...checkpoint, zoneHash: ethers.keccak256(ethers.toUtf8Bytes("zone:untrusted")) },
      { ...checkpoint, authorizationCommitment: ethers.keccak256(ethers.toUtf8Bytes("authorization:changed")) }
    ];
    for (const altered of tampered) {
      assert.notEqual(await registry.checkpointDigest(altered), baselineDigest);
      await assert.rejects(() => registry.verifyCheckpointSigner(altered, signature, 0));
    }
    const wrongSigner = await attacker.signTypedData(domain, types, checkpoint);
    await assert.rejects(() => registry.verifyCheckpointSigner(checkpoint, wrongSigner, 0));
    const wrongDomain = await validator.signTypedData({ ...domain, chainId: domain.chainId + 1n }, types, checkpoint);
    await assert.rejects(() => registry.verifyCheckpointSigner(checkpoint, wrongDomain, 0));
    const wrongRegistry = await validator.signTypedData({ ...domain, verifyingContract: attacker.address }, types, checkpoint);
    await assert.rejects(() => registry.verifyCheckpointSigner(checkpoint, wrongRegistry, 0));
    assert.equal(await registry.consumedCheckpoints(baselineDigest), false);
    assert.equal(await registry.consumedCheckpointNonces(account.address, delegatee.address, 7n), false);
    // This validates signature binding only; it does not authenticate external rollback
    // anchors or establish full dual-proof execution and cross-contract atomicity.
  });
});
