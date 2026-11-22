"use strict";
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

describe("Echo V4 scoped bootstrap registration (LOCAL MOCK ONLY)", function () {
  async function setup() {
    assert.equal(network.name, "hardhat", "no live networks");
    const [owner, outsider] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const verifier = await (await ethers.getContractFactory("EchoBootstrapVerifierMock")).deploy();
    const bridge = await (await ethers.getContractFactory("EchoLocalExecutionBridgeMock")).deploy(registry.target, verifier.target);
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4Bootstrap")).deploy(owner.address, ethers.ZeroAddress, bridge.target, registry.target, verifier.target);
    for (const c of [registry, verifier, bridge, account]) await c.waitForDeployment();
    return { owner, outsider, registry, verifier, bridge, account };
  }
  async function configure({ account, verifier, registry, bridge }, authorized, deadline, nonce) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const abi = ethers.AbiCoder.defaultAbiCoder();
    const tag = ethers.keccak256(ethers.toUtf8Bytes("ECHO_V4_ADMIN_BRIDGE_REGISTRATION_V1"));
    const payload = abi.encode(
      ["bytes32", "address", "address", "address", "bool", "uint256", "uint256", "uint256"],
      [tag, account.target, registry.target, bridge.target, authorized, chainId, nonce, deadline]
    );
    await (await verifier.configure(ethers.keccak256(payload), true)).wait();
  }
  it("registers only the immutable bridge and consumes registration nonce", async function () {
    const x = await setup();
    const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
    await configure(x, true, deadline, 0n);
    await (await x.account.registerImmutableBridge(true, deadline, "0x")).wait();
    assert.equal(await x.registry.authorizedCheckpointBridges(x.account.target, x.bridge.target), true);
    assert.equal(await x.account.registrationNonce(), 1n);
  });
  it("rejects an unapproved proof without state changes", async function () {
    const x = await setup();
    const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
    await assert.rejects(async () => (await x.account.registerImmutableBridge(true, deadline, "0x")).wait());
    assert.equal(await x.account.registrationNonce(), 0n);
    assert.equal(await x.registry.authorizedCheckpointBridges(x.account.target, x.bridge.target), false);
  });
  it("rejects replay after successful registration", async function () {
    const x = await setup();
    const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
    await configure(x, true, deadline, 0n);
    await (await x.account.registerImmutableBridge(true, deadline, "0x")).wait();
    await assert.rejects(async () => (await x.account.registerImmutableBridge(true, deadline, "0x")).wait());
    assert.equal(await x.account.registrationNonce(), 1n);
  });
  it("rejects expired authorization", async function () {
    const x = await setup();
    const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp - 1);
    await configure(x, true, deadline, 0n);
    await assert.rejects(async () => (await x.account.registerImmutableBridge(true, deadline, "0x")).wait());
    assert.equal(await x.account.registrationNonce(), 0n);
  });
  it("rejects changed authorize flag", async function () {
    const x = await setup();
    const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
    await configure(x, true, deadline, 0n);
    await assert.rejects(async () => (await x.account.registerImmutableBridge(false, deadline, "0x")).wait());
    assert.equal(await x.account.registrationNonce(), 0n);
  });
  it("keeps generic administration locked", async function () {
    const x = await setup();
    await assert.rejects(async () => (await x.account.connect(x.owner).executeAdministration(x.registry.target, "0x")).wait());
    assert.equal(await x.account.registrationNonce(), 0n);
  });
  it("rejects a changed deadline without consuming nonce", async function () {
    const x = await setup();
    const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
    await configure(x, true, deadline, 0n);
    await assert.rejects(async () =>
      (await x.account.registerImmutableBridge(true, deadline + 1n, "0x")).wait()
    );
    assert.equal(await x.account.registrationNonce(), 0n);
    assert.equal(await x.registry.authorizedCheckpointBridges(x.account.target, x.bridge.target), false);
  });
  it("rejects authorization intended for a different account", async function () {
    const x = await setup();
    const other = await (await ethers.getContractFactory("EchoSmartAccountV4Bootstrap")).deploy(
      x.outsider.address, ethers.ZeroAddress, x.bridge.target, x.registry.target, x.verifier.target
    );
    await other.waitForDeployment();
    const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
    await configure(x, true, deadline, 0n);
    await assert.rejects(async () =>
      (await other.registerImmutableBridge(true, deadline, "0x")).wait()
    );
    assert.equal(await other.registrationNonce(), 0n);
    assert.equal(await x.registry.authorizedCheckpointBridges(other.target, x.bridge.target), false);
  });
  it("allows an explicitly authorized revocation with a fresh nonce", async function () {
    const x = await setup();
    const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
    await configure(x, true, deadline, 0n);
    await (await x.account.registerImmutableBridge(true, deadline, "0x")).wait();
    await configure(x, false, deadline, 1n);
    await (await x.account.registerImmutableBridge(false, deadline, "0x")).wait();
    assert.equal(await x.account.registrationNonce(), 2n);
    assert.equal(await x.registry.authorizedCheckpointBridges(x.account.target, x.bridge.target), false);
  });
});
