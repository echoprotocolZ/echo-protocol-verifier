const { expect } = require("chai");
const { ethers } = require("hardhat");
const assert = require("node:assert/strict");

describe("ECHO V4 entry-point zero-trust security", function () {
  it("rejects unproven ownership and entry-point changes", async function () {
    const [owner, newOwner, oldEntryPoint, outsider] =
      await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountV4")
    ).deploy(owner.address, oldEntryPoint.address, registry.target);

    await assert.rejects(
      account.connect(owner).transferOwnership(newOwner.address),
      /Unauthorized/
    );

    await assert.rejects(
      account.connect(newOwner).acceptOwnership(),
      /Unauthorized/
    );

    await assert.rejects(
      account.connect(owner).setEntryPoint(ethers.ZeroAddress),
      /Unauthorized/
    );

    await assert.rejects(
      account.connect(outsider).setEntryPoint(outsider.address),
      /Unauthorized/
    );

    expect(await account.owner()).to.equal(owner.address);
    expect(await account.pendingOwner()).to.equal(ethers.ZeroAddress);
    expect(await account.entryPoint()).to.equal(oldEntryPoint.address);
    expect(await account.nonce()).to.equal(0n);
  });
});
