"use strict";
// Fail-closed registry/bridge boundary: no proof fixtures, local Hardhat only.
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

describe("ECHO checkpoint consumption boundary (local-only)", function () {
  it("rejects unauthorized bridge and caller without consuming checkpoint or nonce", async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    const [account, delegatee, attacker] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    await registry.waitForDeployment();
    const verifier = await (await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
    await verifier.waitForDeployment();
    const v3bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV3")).deploy(
      verifier.target, registry.target
    );
    await v3bridge.waitForDeployment();
    const checkpoint = {
      account: account.address,
      delegatee: delegatee.address,
      zoneHash: ethers.keccak256(ethers.toUtf8Bytes("zone")),
      checkpointCommitment: ethers.keccak256(ethers.toUtf8Bytes("checkpoint")),
      authorizationCommitment: ethers.keccak256(ethers.toUtf8Bytes("authorization")),
      timestamp: BigInt((await ethers.provider.getBlock("latest")).timestamp),
      nonce: 42n
    };
    const digest = await registry.checkpointDigest(checkpoint);
    const signature = "0x";
    async function assertUnused() {
      assert.equal(await registry.consumedCheckpoints(digest), false);
      assert.equal(await registry.consumedCheckpointNonces(account.address, delegatee.address, 42n), false);
    }
    await assertUnused();
    await assert.rejects(async () => {
      const tx = await registry.connect(attacker).consumeCheckpoint(checkpoint, signature);
      await tx.wait();
    });
    await assertUnused();
    await assert.rejects(async () => {
      const tx = await registry.connect(attacker).consumeCheckpointFromBridge(checkpoint, signature);
      await tx.wait();
    });
    await assertUnused();
    await assert.rejects(async () => {
      const tx = await registry.connect(account).consumeCheckpointFromBridge(checkpoint, signature);
      await tx.wait();
    });
    await assertUnused();
    // Even an account's registry approval of an unrelated bridge must not authorize an EOA.
    await (await registry.connect(account).setCheckpointBridge(v3bridge.target, true)).wait();
    assert.equal(await registry.authorizedCheckpointBridges(account.address, v3bridge.target), true);
    await assert.rejects(async () => {
      const tx = await registry.connect(attacker).consumeCheckpointFromBridge(checkpoint, signature);
      await tx.wait();
    });
    await assertUnused();
    // Does not prove valid signature/proof acceptance, replay rejection after consumption,
    // trusted-anchor authenticity, or multi-contract atomicity.
  });
});
