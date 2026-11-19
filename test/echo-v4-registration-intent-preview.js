"use strict";
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

describe("Echo V4 bridge registration intent preview (read-only)", function () {
  let account, registry, bridge, owner;
  beforeEach(async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    [owner] = await ethers.getSigners();
    registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    await registry.waitForDeployment();
    bridge = await (await ethers.getContractFactory("EchoLocalExecutionBridgeMock")).deploy(
      registry.target, registry.target
    );
    await bridge.waitForDeployment();
    account = await (await ethers.getContractFactory("EchoSmartAccountV4")).deploy(
      owner.address, ethers.ZeroAddress, bridge.target
    );
    await account.waitForDeployment();
  });
  it("encodes scoped fields and leaves registration and nonce unchanged", async function () {
    const deadline = 2000000000n;
    const payload = await account.bridgeRegistrationIntent(registry.target, bridge.target, true, deadline);
    const fields = ethers.AbiCoder.defaultAbiCoder().decode(
      ["bytes32","address","address","address","bool","uint256","uint256","uint256"], payload
    );
    assert.equal(fields[0], ethers.id("ECHO_V4_ADMIN_BRIDGE_REGISTRATION_V1"));
    assert.equal(fields[1], account.target);
    assert.equal(fields[2], registry.target);
    assert.equal(fields[3], bridge.target);
    assert.equal(fields[4], true);
    assert.equal(fields[5], (await ethers.provider.getNetwork()).chainId);
    assert.equal(fields[6], 0n);
    assert.equal(fields[7], deadline);
    assert.equal(await account.nonce(), 0n);
    assert.equal(await registry.authorizedCheckpointBridges(account.target, bridge.target), false);
  });
  it("separates registration from revocation and rejects invalid inputs", async function () {
    const yes = await account.bridgeRegistrationIntent(registry.target, bridge.target, true, 2000000000);
    const no = await account.bridgeRegistrationIntent(registry.target, bridge.target, false, 2000000000);
    assert.notEqual(yes, no);
    await assert.rejects(account.bridgeRegistrationIntent(ethers.ZeroAddress, bridge.target, true, 1));
    await assert.rejects(account.bridgeRegistrationIntent(registry.target, ethers.ZeroAddress, true, 1));
    await assert.rejects(account.bridgeRegistrationIntent(registry.target, bridge.target, true, 0));
    assert.equal(await account.nonce(), 0n);
  });
  it("binds intents to exact account, registry, bridge and deadline", async function () {
    const otherRegistry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    await otherRegistry.waitForDeployment();
    const otherBridge = await (await ethers.getContractFactory("EchoLocalExecutionBridgeMock")).deploy(
      registry.target, registry.target
    );
    await otherBridge.waitForDeployment();
    const otherAccount = await (await ethers.getContractFactory("EchoSmartAccountV4")).deploy(
      owner.address, ethers.ZeroAddress, bridge.target
    );
    await otherAccount.waitForDeployment();
    const original = await account.bridgeRegistrationIntent(registry.target, bridge.target, true, 2000000000);
    assert.notEqual(original, await otherAccount.bridgeRegistrationIntent(registry.target, bridge.target, true, 2000000000));
    assert.notEqual(original, await account.bridgeRegistrationIntent(otherRegistry.target, bridge.target, true, 2000000000));
    assert.notEqual(original, await account.bridgeRegistrationIntent(registry.target, otherBridge.target, true, 2000000000));
    assert.notEqual(original, await account.bridgeRegistrationIntent(registry.target, bridge.target, true, 2000000001));
    assert.equal(await account.nonce(), 0n);
    assert.equal(await registry.authorizedCheckpointBridges(account.target, bridge.target), false);
  });
  it("does not unlock legacy administration after preview", async function () {
    await account.bridgeRegistrationIntent(registry.target, bridge.target, true, 2000000000);
    const data = registry.interface.encodeFunctionData("setCheckpointBridge", [bridge.target, true]);
    await assert.rejects(account.executeAdministration(registry.target, data));
    await assert.rejects(account.transferOwnership(owner.address));
    await assert.rejects(account.setEntryPoint(owner.address));
    assert.equal(await account.nonce(), 0n);
    assert.equal(await registry.authorizedCheckpointBridges(account.target, bridge.target), false);
  });

});
