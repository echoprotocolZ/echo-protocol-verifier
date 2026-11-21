"use strict";
// Local-only cross-account isolation regression. No proof fixtures or live RPC.
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

describe("ECHO V4 cross-account unauthorized-operation isolation", function () {
  it("preserves both accounts when unauthorized callers target either account", async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    const [ownerA, ownerB, outsider] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    await registry.waitForDeployment();
    const factory = await ethers.getContractFactory("EchoSmartAccountV4");
    const a = await factory.deploy(ownerA.address, ethers.ZeroAddress, registry.target);
    const b = await factory.deploy(ownerB.address, ethers.ZeroAddress, registry.target);
    await Promise.all([a.waitForDeployment(), b.waitForDeployment()]);

    async function capture() {
      return Promise.all([a, b].map(async account => ({
        owner: await account.owner(),
        pendingOwner: await account.pendingOwner(),
        entryPoint: await account.entryPoint(),
        nonce: await account.nonce()
      })));
    }
    const baseline = await capture();
    assert.notEqual(a.target.toLowerCase(), b.target.toLowerCase());
    assert.notEqual(baseline[0].owner, baseline[1].owner);

    const attacks = [
      ["outsider -> A ownership", () => a.connect(outsider).transferOwnership(outsider.address)],
      ["B owner -> A ownership", () => a.connect(ownerB).transferOwnership(ownerB.address)],
      ["A owner -> B ownership", () => b.connect(ownerA).transferOwnership(ownerA.address)],
      ["outsider -> B entry point", () => b.connect(outsider).setEntryPoint(outsider.address)],
      ["A owner -> B administration", () => b.connect(ownerA).executeAdministration(a.target, "0x")],
      ["B owner -> A administration", () => a.connect(ownerB).executeAdministration(b.target, "0x")]
    ];
    for (const [label, attack] of attacks) {
      await assert.rejects(async () => {
        const tx = await attack();
        await tx.wait();
      }, undefined, label + " must revert");
      assert.deepEqual(await capture(), baseline, label + " changed account state");
    }
    // Limitations: no valid proof, checkpoint/nullifier consumption, or concurrent transactions.
  });
});
