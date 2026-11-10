const { expect } = require("chai");
const { ethers } = require("hardhat");
const assert = require("node:assert/strict");

describe("ECHO V4 two-step ownership zero-trust security", function () {
  it("rejects ownership transfers and unauthorized acceptance", async function () {
    const [owner, newOwner, outsider] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountV4")
    ).deploy(owner.address, ethers.ZeroAddress, registry.target);

    await assert.rejects(
      account.connect(owner).transferOwnership(newOwner.address),
      /Unauthorized/
    );

    await assert.rejects(
      account.connect(newOwner).acceptOwnership(),
      /Unauthorized/
    );

    await assert.rejects(
      account.connect(outsider).acceptOwnership(),
      /Unauthorized/
    );

    expect(await account.owner()).to.equal(owner.address);
    expect(await account.pendingOwner()).to.equal(ethers.ZeroAddress);
    expect(await account.nonce()).to.equal(0n);
  });
});
