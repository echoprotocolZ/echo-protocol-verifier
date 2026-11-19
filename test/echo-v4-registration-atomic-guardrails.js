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
  it("blocks registration through generic proof-authorized execution even when mock bridge approves", async function () {
    await (await bridge.setApprove(true)).wait();
    const data = registry.interface.encodeFunctionData("setCheckpointBridge", [bridge.target, true]);
    await assert.rejects(async () => {
      await (await account.executeAuthorized(...request(registry.target, data))).wait();
    });
    assert.equal(await registry.authorizedCheckpointBridges(account.target, bridge.target), false);
    assert.equal(await account.nonce(), 0n);
    assert.equal(await bridge.calls(), 0n);
  });

  it("does not let an EOA bootstrap the smart account's trusted signer or policy", async function () {
    const zone = ethers.id("local-zone");
    await (await registry.connect(owner).setValidatorSigner(owner.address, true)).wait();
    await (await registry.connect(owner).setAttestationPolicy(owner.address, [
      zone, 300, 0, false, true
    ])).wait();
    assert.equal(await registry.trustedValidatorSigners(owner.address, owner.address), true);
    assert.equal(await registry.trustedValidatorSigners(account.target, owner.address), false);
    const ownerPolicy = await registry.attestationPolicies(owner.address, owner.address);
    const accountPolicy = await registry.attestationPolicies(account.target, owner.address);
    assert.equal(ownerPolicy.enabled, true);
    assert.equal(accountPolicy.enabled, false);
    const signerCall = registry.interface.encodeFunctionData("setValidatorSigner", [owner.address, true]);
    await assert.rejects(account.executeAdministration(registry.target, signerCall));
    const policyCall = registry.interface.encodeFunctionData("setAttestationPolicy", [
      owner.address, [zone, 300, 0, false, true]
    ]);
    await assert.rejects(account.executeAdministration(registry.target, policyCall));
    assert.equal(await registry.trustedValidatorSigners(account.target, owner.address), false);
    assert.equal((await registry.attestationPolicies(account.target, owner.address)).enabled, false);
    assert.equal(await account.nonce(), 0n);
  });

});
