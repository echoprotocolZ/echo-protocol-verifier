"use strict";
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

// Local-only regression: never mistake a mock approval for a genuine ZK proof.
describe("Echo V4 registration and atomic rollback guardrails", function () {
  async function deploy(name, ...args) {
    const c = await (await ethers.getContractFactory(name)).deploy(...args);
    await c.waitForDeployment();
    return c;
  }
  let owner, outsider, registry, bridge, account, target;
  const z2 = [0, 0], zB = [[0, 0], [0, 0]];
  function request(destination, data, checkpointAccount = account.target) {
    return [
      { account: checkpointAccount, delegatee: owner.address,
        zoneHash: ethers.ZeroHash, checkpointCommitment: ethers.ZeroHash,
        authorizationCommitment: ethers.ZeroHash, timestamp: 0, nonce: 0 },
      "0x", z2, zB, z2, Array(20).fill(0),
      z2, zB, z2, Array(5).fill(0), destination, 0, data
    ];
  }
  beforeEach(async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    [owner, outsider] = await ethers.getSigners();
    registry = await deploy("EchoAttestationRegistryV3");
    const policy = await deploy("EchoGeographicPolicyRegistryV4");
    const gateway = await deploy("EchoLocalGatewayMock", policy.target);
    const dual = await deploy("EchoLocalDualMock", gateway.target);
    bridge = await deploy("EchoLocalExecutionBridgeMock", registry.target, dual.target);
    account = await deploy("EchoSmartAccountV4", owner.address, ethers.ZeroAddress, bridge.target);
    target = await deploy("EchoLocalTargetMock");
  });
  it("does not permit EOA registration on behalf of a smart account", async function () {
    await (await registry.connect(owner).setCheckpointBridge(bridge.target, true)).wait();
    assert.equal(await registry.authorizedCheckpointBridges(owner.address, bridge.target), true);
    assert.equal(await registry.authorizedCheckpointBridges(account.target, bridge.target), false);
    await assert.rejects(async () => {
      const data = registry.interface.encodeFunctionData("setCheckpointBridge", [bridge.target, true]);
      await (await account.executeAdministration(registry.target, data)).wait();
    });
    assert.equal(await registry.authorizedCheckpointBridges(account.target, bridge.target), false);
  });
  it("rejects mismatched checkpoint account without consuming mock authorization", async function () {
    await (await bridge.setApprove(true)).wait();
    const data = target.interface.encodeFunctionData("increment");
    await assert.rejects(async () => {
      await (await account.executeAuthorized(...request(target.target, data, outsider.address))).wait();
    });
    assert.equal(await bridge.calls(), 0n);
    assert.equal(await account.nonce(), 0n);
    assert.equal(await target.count(), 0n);
  });
  it("rolls back bridge and account state when the target reverts, then permits a clean retry", async function () {
    await (await bridge.setApprove(true)).wait();
    const fail = target.interface.encodeFunctionData("fail");
    await assert.rejects(async () => {
      await (await account.executeAuthorized(...request(target.target, fail))).wait();
    });
    assert.equal(await bridge.calls(), 0n);
    assert.equal(await account.nonce(), 0n);
    assert.equal(await target.count(), 0n);
    const increment = target.interface.encodeFunctionData("increment");
    await (await account.executeAuthorized(...request(target.target, increment))).wait();
    assert.equal(await bridge.calls(), 1n);
    assert.equal(await account.nonce(), 1n);
    assert.equal(await target.count(), 1n);
  });
});
