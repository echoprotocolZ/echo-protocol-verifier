const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("Echo bootstrap pair deterministic deployment (local only)", function () {
  it("predicts both addresses and pins the executor to its gate", async function () {
    const [owner] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const verifier = await (await ethers.getContractFactory("EchoBootstrapVerifierStub")).deploy(false);
    const factory = await (await ethers.getContractFactory("EchoBootstrapPairFactoryV1")).deploy();
    const salt = ethers.id("echo-bootstrap-local-test");
    const predictedGate = await factory.predictGate();
    const predictedExecutor = await factory.predictExecutor(await registry.getAddress(), salt);
    const tx = await factory.deployPair(await registry.getAddress(), await verifier.getAddress(), 123n, salt);
    await tx.wait();
    const gate = await ethers.getContractAt("EchoBootstrapProofGateV1", predictedGate);
    const executor = await ethers.getContractAt("EchoBootstrapBridgeExecutorV1", predictedExecutor);
    assert.equal(await gate.account(), predictedExecutor);
    assert.equal(await executor.gate(), predictedGate);
    assert.equal(await gate.registry(), await registry.getAddress());
    assert.equal(await executor.registry(), await registry.getAddress());
    assert.equal(await gate.trustedRoot(), 123n);
    assert.equal(await factory.deployed(), true);
    await assert.rejects(factory.deployPair(await registry.getAddress(), await verifier.getAddress(), 123n, salt));
  });
});
