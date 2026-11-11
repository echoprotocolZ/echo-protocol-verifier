const { expect } = require("chai");
const { ethers } = require("hardhat");
const assert = require("node:assert/strict");

describe("ECHO V4 read-only ownership proposal intent", function () {
  it("binds account address, live chain, nonce, successor and deadline", async function () {
    const [owner, successor, outsider] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4"))
      .deploy(owner.address, ethers.ZeroAddress, registry.target);
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deadline = 2000000000n;
    const expected = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
      [
        ethers.id("ECHO_V4_ADMIN_OWNERSHIP_PROPOSAL_V1"),
        account.target, successor.address, chainId, 0n, deadline
      ]
    );
    expect(await account.ownershipProposalIntent(successor.address, deadline)).to.equal(expected);
    expect(await account.ownershipProposalIntent(successor.address, deadline))
      .not.to.equal(await account.ownershipProposalIntent(outsider.address, deadline));
    expect(await account.owner()).to.equal(owner.address);
    expect(await account.pendingOwner()).to.equal(ethers.ZeroAddress);
    expect(await account.nonce()).to.equal(0n);
  });

  it("rejects invalid successor and deadline without changing state", async function () {
    const [owner] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4"))
      .deploy(owner.address, ethers.ZeroAddress, registry.target);
    await assert.rejects(account.ownershipProposalIntent(ethers.ZeroAddress, 1n), /InvalidSuccessor/);
    await assert.rejects(account.ownershipProposalIntent(account.target, 1n), /InvalidSuccessor/);
    await assert.rejects(account.ownershipProposalIntent(owner.address, 0n), /InvalidDeadline/);
    expect(await account.pendingOwner()).to.equal(ethers.ZeroAddress);
    expect(await account.nonce()).to.equal(0n);
  });
});
