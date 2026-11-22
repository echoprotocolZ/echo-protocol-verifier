"use strict";
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

// Integration boundary: real ECDSA registration, MOCK execution bridge.
// This DOES NOT test Groth16 verification or real checkpoint consumption.
describe("Echo V4 registration to execution boundary (LOCAL ONLY)", function () {
  async function setup() {
    assert.equal(network.name, "hardhat");
    const [owner, outsider] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const verifier = await (await ethers.getContractFactory("EchoV4BootstrapSignatureVerifier")).deploy(owner.address);
    const policy = await (await ethers.getContractFactory("EchoLocalTargetMock")).deploy();
    const gateway = await (await ethers.getContractFactory("EchoLocalGatewayMock")).deploy(policy.target);
    const dual = await (await ethers.getContractFactory("EchoLocalDualMock")).deploy(gateway.target);
    const bridge = await (await ethers.getContractFactory("EchoLocalExecutionBridgeMock")).deploy(registry.target, dual.target);
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4Bootstrap")).deploy(
      owner.address, ethers.ZeroAddress, bridge.target, registry.target, verifier.target
    );
    const target = await (await ethers.getContractFactory("EchoLocalTargetMock")).deploy();
    for (const c of [registry,verifier,policy,gateway,dual,bridge,account,target]) await c.waitForDeployment();
    const d = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
    const tag = ethers.keccak256(ethers.toUtf8Bytes("ECHO_V4_ADMIN_BRIDGE_REGISTRATION_V1"));
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32","address","address","address","bool","uint256","uint256","uint256"],
      [tag,account.target,registry.target,bridge.target,true,(await ethers.provider.getNetwork()).chainId,0n,d]
    );
    const digest = await verifier.registrationDigest(ethers.keccak256(encoded));
    const signature = await owner.signMessage(ethers.getBytes(digest));
    const checkpoint = {
      account:account.target, delegatee:outsider.address,
      zoneHash:ethers.ZeroHash,checkpointCommitment:ethers.ZeroHash,
      authorizationCommitment:ethers.ZeroHash,timestamp:0,nonce:0
    };
    const execute = () => account.connect(outsider).executeAuthorized(
      checkpoint,"0x",[0,0],[[0,0],[0,0]],[0,0],Array(20).fill(0),
      [0,0],[[0,0],[0,0]],[0,0],Array(5).fill(0),
      target.target,0,target.interface.encodeFunctionData("increment")
    );
    return {owner,outsider,registry,verifier,bridge,account,target,d,signature,execute};
  }

  it("registration alone cannot authorize execution; rejected call rolls back", async function () {
    const x = await setup();
    await (await x.account.registerImmutableBridge(true,x.d,x.signature)).wait();
    assert.equal(await x.registry.authorizedCheckpointBridges(x.account.target,x.bridge.target),true);
    assert.equal(await x.account.registrationNonce(),1n);
    assert.equal(await x.account.nonce(),0n);
    await assert.rejects(async () => (await x.execute()).wait());
    assert.equal(await x.target.count(),0n);
    assert.equal(await x.bridge.calls(),0n);
    assert.equal(await x.account.nonce(),0n);
  });

  it("mock execution succeeds only after separately enabling mock bridge", async function () {
    const x = await setup();
    await (await x.account.registerImmutableBridge(true,x.d,x.signature)).wait();
    await (await x.bridge.setApprove(true)).wait();
    await (await x.execute()).wait();
    assert.equal(await x.target.count(),1n);
    assert.equal(await x.bridge.calls(),1n);
    assert.equal(await x.account.nonce(),1n);
    assert.equal(await x.account.registrationNonce(),1n);
  });

  it("registration cannot unlock generic administration or ownership", async function () {
    const x = await setup();
    await (await x.account.registerImmutableBridge(true,x.d,x.signature)).wait();
    await assert.rejects(async () => (await x.account.executeAdministration(x.target.target,"0x")).wait());
    await assert.rejects(async () => (await x.account.transferOwnership(x.outsider.address)).wait());
    assert.equal(await x.account.owner(),x.owner.address);
    assert.equal(await x.account.nonce(),0n);
  });
});
