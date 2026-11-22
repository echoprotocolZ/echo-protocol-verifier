"use strict";
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

// LOCAL-ONLY security invariant: a bridge cannot register itself for a smart
// account by calling the registry. No ZK proof success is asserted here.
describe("Echo V4 real bridge cannot self-bootstrap registry trust (local)", function () {
  it("keeps smart-account registration false after EOA and bridge calls", async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    const [owner, outsider] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    await registry.waitForDeployment();

    // Real bridge with on-chain dependencies; no authorization mocks.
    const verifier = await (await ethers.getContractFactory("EchoLocalDualMock")).deploy(outsider.address);
    await verifier.waitForDeployment();
    const bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(verifier.target, registry.target);
    await bridge.waitForDeployment();
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4")).deploy(owner.address, ethers.ZeroAddress, bridge.target);
    await account.waitForDeployment();

    assert.equal(await registry.authorizedCheckpointBridges(account.target, bridge.target), false);
    const nonceBefore = await account.nonce();

    // EOA registration affects only the EOA's mapping.
    await (await registry.connect(owner).setCheckpointBridge(bridge.target, true)).wait();
    assert.equal(await registry.authorizedCheckpointBridges(owner.address, bridge.target), true);
    assert.equal(await registry.authorizedCheckpointBridges(account.target, bridge.target), false);

    // An unrelated caller also cannot register the bridge for the account.
    await (await registry.connect(outsider).setCheckpointBridge(bridge.target, true)).wait();
    assert.equal(await registry.authorizedCheckpointBridges(outsider.address, bridge.target), true);
    assert.equal(await registry.authorizedCheckpointBridges(account.target, bridge.target), false);

    assert.equal(await account.nonce(), nonceBefore);
  });
});
