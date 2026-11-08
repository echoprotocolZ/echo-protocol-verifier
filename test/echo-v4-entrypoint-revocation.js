const { expect } = require("chai");
const { ethers } = require("hardhat");
const assert = require("node:assert/strict");

describe("ECHO V4 entry-point revocation security", function () {
  it("rejects the old entry point after ownership transfer and revocation", async function () {
    const [owner, newOwner, oldEntryPoint, delegatee] =
      await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountV4")
    ).deploy(owner.address, oldEntryPoint.address, registry.target);

    await account.connect(owner).transferOwnership(newOwner.address);
    await account.connect(newOwner).acceptOwnership();

    expect(await account.owner()).to.equal(newOwner.address);
    expect(await account.entryPoint()).to.equal(oldEntryPoint.address);

    await account.connect(newOwner).setEntryPoint(ethers.ZeroAddress);
    expect(await account.entryPoint()).to.equal(ethers.ZeroAddress);

    const checkpoint = {
      account: account.target,
      delegatee: delegatee.address,
      zoneHash: ethers.ZeroHash,
      checkpointCommitment: ethers.ZeroHash,
      authorizationCommitment: ethers.ZeroHash,
      timestamp: 0,
      nonce: 0
    };

    await assert.rejects(
      account.connect(oldEntryPoint).executeAuthorized(
        checkpoint, "0x",
        [0, 0], [[0, 0], [0, 0]], [0, 0],
        Array(20).fill(0),
        [0, 0], [[0, 0], [0, 0]], [0, 0],
        Array(5).fill(0),
        delegatee.address, 0, "0x"
      ),
      /Unauthorized/
    );

    expect(await account.nonce()).to.equal(0n);
  });
});
