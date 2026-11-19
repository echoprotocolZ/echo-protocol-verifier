const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("Echo Safe-approved bootstrap factory boundary (local mock only)", function () {
  async function setup() {
    const [owner, outsider] = await ethers.getSigners();
    const safe = await (await ethers.getContractFactory("EchoBootstrap1271Stub")).deploy();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const verifier = await (await ethers.getContractFactory("EchoBootstrapVerifierStub")).deploy(false);
    const factory = await (await ethers.getContractFactory("EchoBootstrapSafeApprovedFactoryV1")).deploy(await safe.getAddress());
    const registryAddress = await registry.getAddress();
    const verifierAddress = await verifier.getAddress();
    const salt = ethers.id("approved-bootstrap-v1");
    const root = 123456n;
    const digest = await factory.approvalDigest(registryAddress, verifierAddress, root, salt);
    const deploy = (r = root, s = salt, v = verifierAddress, sig = "0x1234") =>
      factory.connect(outsider).deployApprovedPair(registryAddress, v, r, s, sig);
    return { owner, outsider, safe, registry, verifier, factory, registryAddress, verifierAddress, salt, root, digest, deploy };
  }

  it("rejects missing approval and invalid signatures", async function () {
    const f = await setup();
    await assert.rejects(f.deploy());
    await f.safe.approve(f.digest);
    await assert.rejects(f.deploy(f.root, f.salt, f.verifierAddress, "0x5678"));
    assert.equal(await f.factory.deployed(), false);
  });

  it("rejects altered root, salt, and verifier after approval", async function () {
    const f = await setup();
    await f.safe.approve(f.digest);
    await assert.rejects(f.deploy(f.root + 1n));
    await assert.rejects(f.deploy(f.root, ethers.id("other-salt")));
    const anotherVerifier = await (await ethers.getContractFactory("EchoBootstrapVerifierStub")).deploy(false);
    await assert.rejects(f.deploy(f.root, f.salt, await anotherVerifier.getAddress()));
    assert.equal(await f.factory.deployed(), false);
  });

  it("rejects threshold changes even when an approval digest remains accepted", async function () {
    const f = await setup();
    await f.safe.approve(f.digest);
    await f.safe.setThreshold(1);
    await assert.rejects(f.deploy());
    assert.equal(await f.factory.deployed(), false);
  });

  it("rejects changed Safe owner set even with an accepted digest", async function () {
    const f = await setup();
    await f.safe.approve(f.digest);
    await f.safe.replaceOwner(0, f.outsider.address);
    await assert.rejects(f.deploy());
    assert.equal(await f.factory.deployed(), false);
  });

  it("rejects revoked approval", async function () {
    const f = await setup();
    await f.safe.approve(f.digest);
    await f.safe.revoke();
    await assert.rejects(f.deploy());
    assert.equal(await f.factory.deployed(), false);
  });

  it("deploys only after approval and rejects repeated deployment", async function () {
    const f = await setup();
    await f.safe.approve(f.digest);
    const expectedGate = await f.factory.predictGate();
    const expectedExecutor = await f.factory.predictExecutor(f.registryAddress, f.salt);
    await (await f.deploy()).wait();
    assert.equal(await f.factory.deployed(), true);
    const gate = await ethers.getContractAt("EchoBootstrapProofGateV1", expectedGate);
    const executor = await ethers.getContractAt("EchoBootstrapBridgeExecutorV1", expectedExecutor);
    assert.equal(await gate.account(), expectedExecutor);
    assert.equal(await gate.trustedRoot(), f.root);
    assert.equal(await executor.gate(), expectedGate);
    await assert.rejects(f.deploy());
  });
});
