"use strict";
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

// Regression gate: do not accidentally make the disabled admin entrypoint
// a bypass for account-specific registry registration.
describe("Echo V4 registration bootstrap remains fail-closed (local)", function () {
  it("rejects an owner's generic registration call and leaves registry/account state unchanged", async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    const [owner, outsider] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    await registry.waitForDeployment();
    const policy = await (await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")).deploy();
    await policy.waitForDeployment();
    const gateway = await (await ethers.getContractFactory("EchoLocalGatewayMock")).deploy(policy.target);
    await gateway.waitForDeployment();
    const dual = await (await ethers.getContractFactory("EchoLocalDualMock")).deploy(gateway.target);
    await dual.waitForDeployment();
    const bridge = await (await ethers.getContractFactory("EchoLocalExecutionBridgeMock")).deploy(registry.target, dual.target);
    await bridge.waitForDeployment();
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4")).deploy(owner.address, ethers.ZeroAddress, bridge.target);
    await account.waitForDeployment();

    const data = registry.interface.encodeFunctionData("setCheckpointBridge", [bridge.target, true]);
    const initialNonce = await account.nonce();
    await assert.rejects(async () => {
      await (await account.connect(owner).executeAdministration(registry.target, data)).wait();
    });
    await assert.rejects(async () => {
      await (await account.connect(outsider).executeAdministration(registry.target, data)).wait();
    });
    assert.equal(await account.nonce(), initialNonce);
    assert.equal(await registry.authorizedCheckpointBridges(account.target, bridge.target), false);

    // EOA registration must not register the bridge on behalf of the smart account.
    await (await registry.connect(owner).setCheckpointBridge(bridge.target, true)).wait();
    assert.equal(await registry.authorizedCheckpointBridges(owner.address, bridge.target), true);
    assert.equal(await registry.authorizedCheckpointBridges(account.target, bridge.target), false);
  });
});
