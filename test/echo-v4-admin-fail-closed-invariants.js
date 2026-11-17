const { expect } = require("chai");
const { ethers } = require("hardhat");
const assert = require("node:assert/strict");

// Production V4 currently fails closed for administrative mutations.
// These tests must be updated alongside any future proof-bound admin entrypoint.
describe("ECHO V4 administration fail-closed invariants", function () {
  async function fixture() {
    const [owner, successor, outsider] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    // Registry has code and satisfies constructor dependency validation;
    // no proof authorization is exercised in this fail-closed fixture.
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4"))
      .deploy(owner.address, ethers.ZeroAddress, registry.target);
    return { owner, successor, outsider, registry, account };
  }

  it("rejects every disabled admin entrypoint even when called by the owner", async function () {
    const { owner, successor, registry, account } = await fixture();
    const beforeNonce = await account.nonce();
    await assert.rejects(account.connect(owner).setEntryPoint(successor.address), /Unauthorized/);
    await assert.rejects(account.connect(owner).transferOwnership(successor.address), /Unauthorized/);
    await assert.rejects(account.connect(owner).acceptOwnership(), /Unauthorized/);
    await assert.rejects(account.connect(owner).executeAdministration(registry.target, "0x"), /Unauthorized/);
    await assert.rejects(account.connect(owner).executeGeographicAdministration("0x"), /Unauthorized/);
    expect(await account.owner()).to.equal(owner.address);
    expect(await account.pendingOwner()).to.equal(ethers.ZeroAddress);
    expect(await account.entryPoint()).to.equal(ethers.ZeroAddress);
    expect(await account.nonce()).to.equal(beforeNonce);
  });

  it("rejects outsider admin mutations without changing ownership or nonce", async function () {
    const { owner, successor, outsider, registry, account } = await fixture();
    await assert.rejects(account.connect(outsider).transferOwnership(successor.address), /Unauthorized/);
    await assert.rejects(account.connect(outsider).setEntryPoint(outsider.address), /Unauthorized/);
    await assert.rejects(account.connect(outsider).executeAdministration(registry.target, "0x"), /Unauthorized/);
    await assert.rejects(account.connect(outsider).executeGeographicAdministration("0x"), /Unauthorized/);
    expect(await account.owner()).to.equal(owner.address);
    expect(await account.pendingOwner()).to.equal(ethers.ZeroAddress);
    expect(await account.nonce()).to.equal(0n);
  });
});
