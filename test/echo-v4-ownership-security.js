const { expect } = require("chai");
const { ethers } = require("hardhat");
const assert = require("node:assert/strict");

describe("ECHO V4 ownership zero-trust security", function () {
  let owner, newOwner, outsider, account;

  beforeEach(async function () {
    [owner, newOwner, outsider] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    account = await (
      await ethers.getContractFactory("EchoSmartAccountV4")
    ).deploy(owner.address, ethers.ZeroAddress, registry.target);
  });

  async function expectUnchanged() {
    expect(await account.owner()).to.equal(owner.address);
    expect(await account.pendingOwner()).to.equal(ethers.ZeroAddress);
    expect(await account.entryPoint()).to.equal(ethers.ZeroAddress);
  }

  it("rejects outsider ownership transfers", async function () {
    await assert.rejects(
      account.connect(outsider).transferOwnership(outsider.address),
      /Unauthorized/
    );
    await expectUnchanged();
  });

  it("rejects zero-address ownership transfers", async function () {
    await assert.rejects(
      account.connect(owner).transferOwnership(ethers.ZeroAddress),
      /Unauthorized/
    );
    await expectUnchanged();
  });

  it("rejects owner-initiated ownership transfers", async function () {
    await assert.rejects(
      account.connect(owner).transferOwnership(newOwner.address),
      /Unauthorized/
    );
    await expectUnchanged();
  });

  it("rejects entry-point changes by the owner", async function () {
    await assert.rejects(
      account.connect(owner).setEntryPoint(outsider.address),
      /Unauthorized/
    );
    await expectUnchanged();
  });

  it("rejects entry-point changes by outsiders", async function () {
    await assert.rejects(
      account.connect(outsider).setEntryPoint(outsider.address),
      /Unauthorized/
    );
    await expectUnchanged();
  });

  it("rejects ownership acceptance by outsiders", async function () {
    await assert.rejects(
      account.connect(outsider).acceptOwnership(),
      /Unauthorized/
    );
    await expectUnchanged();
  });

  it("rejects ownership acceptance by proposed new owners", async function () {
    await assert.rejects(
      account.connect(newOwner).acceptOwnership(),
      /Unauthorized/
    );
    await expectUnchanged();
  });

  it("rejects entry-point rotation by proposed new owners", async function () {
    await assert.rejects(
      account.connect(newOwner).setEntryPoint(newOwner.address),
      /Unauthorized/
    );
    await expectUnchanged();
  });
});
