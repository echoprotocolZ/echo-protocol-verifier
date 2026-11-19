const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const assert = require("node:assert/strict");

describe("Echo founder vesting prototype — local only", function () {
  const MONTH = 30 * 24 * 60 * 60;
  const grant = ethers.parseUnits("10000000", 18);
  let owner, founder, outsider, token, vesting, start;
  beforeEach(async function () {
    [owner, founder, outsider] = await ethers.getSigners();
    token = await (await ethers.getContractFactory("EchoVestingTestToken")).deploy();
    await token.waitForDeployment();
    const block = await ethers.provider.getBlock("latest");
    start = block.timestamp + 3600;
    vesting = await (await ethers.getContractFactory("EchoFounderVestingPrototype")).deploy(await token.getAddress(), founder.address, start, grant);
    await vesting.waitForDeployment();
    await (await token.mint(await vesting.getAddress(), grant)).wait();
  });
  async function at(months) {
    await network.provider.send("evm_setNextBlockTimestamp", [start + months * MONTH]);
    await network.provider.send("evm_mine");
  }
  it("locks all tokens through month 12 and unlocks first installment at month 13", async function () {
    await at(12);
    assert.equal(await vesting.claimable(), 0n);
    await assert.rejects(vesting.connect(founder).claim());
    await at(13);
    assert.equal(await vesting.claimable(), grant / 36n);
  });
  it("rejects outsider, permits beneficiary claim, and blocks double claim", async function () {
    await at(13);
    await assert.rejects(vesting.connect(outsider).claim());
    await (await vesting.connect(founder).claim()).wait();
    assert.equal(await token.balanceOf(founder.address), grant / 36n);
    await assert.rejects(vesting.connect(founder).claim());
  });
  it("fully releases at month 48 and cannot release beyond grant", async function () {
    await at(48);
    assert.equal(await vesting.claimable(), grant);
    await (await vesting.connect(founder).claim()).wait();
    assert.equal(await token.balanceOf(founder.address), grant);
    assert.equal(await vesting.claimable(), 0n);
    await assert.rejects(vesting.connect(founder).claim());
  });
});
