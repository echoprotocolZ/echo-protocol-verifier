"use strict";
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

// Real ECDSA signatures, NOT Groth16/ZK proofs. Local-only.
describe("Echo V4 ECDSA bootstrap registration (local)", function () {
  async function fixture() {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    const [trusted, outsider] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const verifier = await (await ethers.getContractFactory("EchoV4BootstrapSignatureVerifier")).deploy(trusted.address);
    const bridge = await (await ethers.getContractFactory("EchoLocalExecutionBridgeMock")).deploy(registry.target, verifier.target);
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4Bootstrap")).deploy(
      trusted.address, ethers.ZeroAddress, bridge.target, registry.target, verifier.target
    );
    for (const c of [registry, verifier, bridge, account]) await c.waitForDeployment();
    return { trusted, outsider, registry, verifier, bridge, account };
  }
  async function signature(x, signer, authorized, deadline, account = x.account, nonce = 0n) {
    const tag = ethers.keccak256(ethers.toUtf8Bytes("ECHO_V4_ADMIN_BRIDGE_REGISTRATION_V1"));
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32","address","address","address","bool","uint256","uint256","uint256"],
      [tag,account.target,x.registry.target,x.bridge.target,authorized,chainId,nonce,deadline]
    );
    const digest = await x.verifier.registrationDigest(ethers.keccak256(encoded));
    return signer.signMessage(ethers.getBytes(digest));
  }
  async function deadline() {
    return BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
  }
  it("registers bridge with a genuine trusted ECDSA signature", async function () {
    const x = await fixture(); const d = await deadline();
    const sig = await signature(x,x.trusted,true,d);
    await (await x.account.connect(x.outsider).registerImmutableBridge(true,d,sig)).wait();
    assert.equal(await x.registry.authorizedCheckpointBridges(x.account.target,x.bridge.target),true);
    assert.equal(await x.account.registrationNonce(),1n);
  });
  it("rejects an outsider signature without changing state", async function () {
    const x = await fixture(); const d = await deadline();
    await assert.rejects(async () => (await x.account.registerImmutableBridge(true,d,await signature(x,x.outsider,true,d))).wait());
    assert.equal(await x.account.registrationNonce(),0n);
    assert.equal(await x.registry.authorizedCheckpointBridges(x.account.target,x.bridge.target),false);
  });
  it("rejects replayed signature after nonce consumption", async function () {
    const x = await fixture(); const d = await deadline(); const sig = await signature(x,x.trusted,true,d);
    await (await x.account.registerImmutableBridge(true,d,sig)).wait();
    await assert.rejects(async () => (await x.account.registerImmutableBridge(true,d,sig)).wait());
    assert.equal(await x.account.registrationNonce(),1n);
  });
  it("rejects signature substitution across accounts", async function () {
    const x = await fixture(); const d = await deadline();
    const other = await (await ethers.getContractFactory("EchoSmartAccountV4Bootstrap")).deploy(
      x.outsider.address,ethers.ZeroAddress,x.bridge.target,x.registry.target,x.verifier.target
    ); await other.waitForDeployment();
    const sig = await signature(x,x.trusted,true,d);
    await assert.rejects(async () => (await other.registerImmutableBridge(true,d,sig)).wait());
    assert.equal(await other.registrationNonce(),0n);
    assert.equal(await x.registry.authorizedCheckpointBridges(other.target,x.bridge.target),false);
  });
  it("rejects altered authorization flag and deadline", async function () {
    const x = await fixture(); const d = await deadline(); const sig = await signature(x,x.trusted,true,d);
    await assert.rejects(async () => (await x.account.registerImmutableBridge(false,d,sig)).wait());
    await assert.rejects(async () => (await x.account.registerImmutableBridge(true,d+1n,sig)).wait());
    assert.equal(await x.account.registrationNonce(),0n);
  });
  it("rejects signature for another verifier instance", async function () {
    const x = await fixture(); const d = await deadline();
    const otherVerifier = await (await ethers.getContractFactory("EchoV4BootstrapSignatureVerifier")).deploy(x.trusted.address);
    await otherVerifier.waitForDeployment();
    const sig = await signature(x,x.trusted,true,d);
    const digest = await x.verifier.registrationDigest(ethers.keccak256("0x1234"));
    assert.equal(await otherVerifier.verifyRegistration(ethers.keccak256("0x1234"),await x.trusted.signMessage(ethers.getBytes(digest))),false);
    assert.equal(await x.account.registrationNonce(),0n);
    assert.equal(ethers.isHexString(sig),true);
  });
});
