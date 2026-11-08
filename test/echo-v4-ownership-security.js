const { expect } = require("chai");
const { ethers } = require("hardhat");
const assert = require("node:assert/strict");

describe("ECHO V4 ownership security", function () {
  let owner, newOwner, outsider, account;

  beforeEach(async function () {
    [owner, newOwner, outsider] = await ethers.getSigners();

    // Deployed code used only for constructor validation.
    // These tests do not exercise bridge authorization.
    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    account = await (
      await ethers.getContractFactory("EchoSmartAccountV4")
    ).deploy(owner.address, ethers.ZeroAddress, registry.target);
  });

  it("rejects unauthorized ownership transfers", async function () {
    await assert.rejects(account.connect(outsider).transferOwnership(outsider.address), /Unauthorized/);
  });

  it("rejects zero-address ownership transfers", async function () {
    await assert.rejects(account.connect(owner).transferOwnership(ethers.ZeroAddress), /Unauthorized/);
  });

  it("transfers ownership to the new owner", async function () {
    await account.connect(owner).transferOwnership(newOwner.address);
    expect(await account.owner()).to.equal(owner.address);
    expect(await account.pendingOwner()).to.equal(newOwner.address);

    await account.connect(newOwner).acceptOwnership();
    expect(await account.owner()).to.equal(newOwner.address);
    expect(await account.pendingOwner()).to.equal(ethers.ZeroAddress);
  });

  it("removes previous-owner entry-point permissions", async function () {
    await account.connect(owner).transferOwnership(newOwner.address);

    await account.connect(owner).setEntryPoint(outsider.address);
    await account.connect(newOwner).acceptOwnership();

    await assert.rejects(
      account.connect(owner).setEntryPoint(outsider.address),
      /Unauthorized/
    );

    await account.connect(newOwner).setEntryPoint(outsider.address);
    expect(await account.entryPoint()).to.equal(outsider.address);
  });

  it("preserves the entry point during ownership transfer", async function () {
    await account.connect(owner).setEntryPoint(outsider.address);
    await account.connect(owner).transferOwnership(newOwner.address);
    await account.connect(newOwner).acceptOwnership();

    expect(await account.entryPoint()).to.equal(outsider.address);
  });

  it("rejects unauthorized ownership acceptance", async function () {
    await account.connect(owner).transferOwnership(newOwner.address);
    await assert.rejects(
      account.connect(outsider).acceptOwnership(),
      /Unauthorized/
    );
    expect(await account.owner()).to.equal(owner.address);
  });

  it("invalidates a replaced pending owner", async function () {
    await account.connect(owner).transferOwnership(newOwner.address);
    await account.connect(owner).transferOwnership(outsider.address);

    await assert.rejects(
      account.connect(newOwner).acceptOwnership(),
      /Unauthorized/
    );

    expect(await account.pendingOwner()).to.equal(outsider.address);
    await account.connect(outsider).acceptOwnership();
    expect(await account.owner()).to.equal(outsider.address);
  });

});
