"use strict";
// Local-only regression. A Hardhat snapshot is NOT an authenticated rollback anchor.
// This checks rejection/state invariants; it does NOT prove atomic cross-contract fencing.
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

describe("ECHO local rollback and unauthorized-operation fence", function () {
  it("rejects unauthorized mutations before and after snapshot rollback", async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY: do not run on a live network");
    const [owner, outsider] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    await registry.waitForDeployment();
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4")).deploy(
      owner.address, ethers.ZeroAddress, registry.target
    );
    await account.waitForDeployment();

    async function state() {
      return {
        owner: await account.owner(),
        pendingOwner: await account.pendingOwner(),
        entryPoint: await account.entryPoint(),
        nonce: await account.nonce()
      };
    }
    const original = await state();
    const snapshot = await network.provider.send("evm_snapshot", []);

    async function rejectAndPreserve(label, invoke) {
      const before = await state();
      await assert.rejects(async () => {
        const tx = await invoke();
        await tx.wait();
      }, undefined, label + " must revert");
      assert.deepEqual(await state(), before, label + " mutated state");
    }

    await rejectAndPreserve("outsider ownership", () =>
      account.connect(outsider).transferOwnership(outsider.address));
    await rejectAndPreserve("owner proof-free ownership", () =>
      account.connect(owner).transferOwnership(outsider.address));
    await rejectAndPreserve("owner proof-free entry point", () =>
      account.connect(owner).setEntryPoint(outsider.address));
    await rejectAndPreserve("owner proof-free administration", () =>
      account.connect(owner).executeAdministration(outsider.address, "0x"));

    assert.equal(await network.provider.send("evm_revert", [snapshot]), true);
    assert.deepEqual(await state(), original, "rollback failed to restore baseline");

    // Recheck after rollback to catch any accidental change to authorization behavior.
    await rejectAndPreserve("post-rollback outsider ownership", () =>
      account.connect(outsider).transferOwnership(outsider.address));
    await rejectAndPreserve("post-rollback owner entry point", () =>
      account.connect(owner).setEntryPoint(outsider.address));
    assert.deepEqual(await state(), original);

    // This suite cannot authenticate an externally supplied rollback anchor,
    // prove fencing across independent bridge/registry transactions, or verify Amoy.
  });
});
