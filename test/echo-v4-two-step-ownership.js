const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ECHO V4 two-step ownership security", function () {
  it("requires the new owner to accept ownership", async function () {
    const [owner, newOwner] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountV4")
    ).deploy(owner.address, ethers.ZeroAddress, registry.target);

    await (
      await account.connect(owner).transferOwnership(newOwner.address)
    ).wait();

    expect(await account.owner()).to.equal(owner.address);
    expect(await account.pendingOwner()).to.equal(newOwner.address);

    await (
      await account.connect(newOwner).acceptOwnership()
    ).wait();

    expect(await account.owner()).to.equal(newOwner.address);
    expect(await account.pendingOwner()).to.equal(ethers.ZeroAddress);
  });
});
