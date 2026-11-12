const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const assert = require("node:assert/strict");

describe("EchoStakingSourceFixture — collateral solvency and rescue", function () {
  const stakeAmount = ethers.parseEther("1000");
  const rewards = ethers.parseEther("300");
  const penalty = ethers.parseEther("100");
  let owner, validator, recipient, token, staking;

  async function reverted(txPromise, message) {
    await assert.rejects(async () => { const tx = await txPromise; await tx.wait(); }, (e) => {
      assert.ok(String(e).includes(message), String(e));
      return true;
    });
  }
  async function assertSolvent() {
    const balance = await token.balanceOf(await staking.getAddress());
    const reserved = (await staking.totalStaked()) + (await staking.rewardPool());
    assert.ok(balance >= reserved, "staking and rewards exceed contract token balance");
    expect(await staking.availableExcessEcho()).to.equal(balance - reserved);
  }
  async function matureAndRequest() {
    await network.provider.send("evm_increaseTime", [90 * 86400 + 1]);
    await network.provider.send("evm_mine");
    await (await staking.connect(validator).requestUnstake()).wait();
    await network.provider.send("evm_increaseTime", [86401]);
    await network.provider.send("evm_mine");
  }
  beforeEach(async function () {
    [owner, validator, recipient] = await ethers.getSigners();
    token = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await token.waitForDeployment();
    staking = await (await ethers.getContractFactory("EchoStakingSourceFixture")).deploy(await token.getAddress());
    await staking.waitForDeployment();
    await (await token.mint(validator.address, stakeAmount)).wait();
    await (await token.connect(validator).approve(await staking.getAddress(), stakeAmount)).wait();
    await (await staking.connect(validator).stake(stakeAmount)).wait();
    await assertSolvent();
  });

  it("cannot rescue staked collateral", async function () {
    await reverted(staking.rescueExcessTokens(await token.getAddress(), recipient.address, 1n), "Reserved ECHO cannot be rescued");
    await assertSolvent();
    expect(await staking.totalStaked()).to.equal(stakeAmount);
  });

  it("cannot rescue reward pool or validator collateral", async function () {
    await (await token.approve(await staking.getAddress(), rewards)).wait();
    await (await staking.fundRewards(rewards)).wait();
    await reverted(staking.rescueExcessTokens(await token.getAddress(), recipient.address, 1n), "Reserved ECHO cannot be rescued");
    expect(await staking.rewardPool()).to.equal(rewards);
    await assertSolvent();
  });

  it("slashes into rewards without reducing total backing", async function () {
    const before = await token.balanceOf(await staking.getAddress());
    await (await staking.slash(validator.address, ethers.id("solvency-slash"))).wait();
    expect(await staking.totalStaked()).to.equal(stakeAmount - penalty);
    expect(await staking.rewardPool()).to.equal(penalty);
    expect(await token.balanceOf(await staking.getAddress())).to.equal(before);
    await reverted(staking.rescueExcessTokens(await token.getAddress(), recipient.address, 1n), "Reserved ECHO cannot be rescued");
    await assertSolvent();
  });

  it("preserves solvency across partial and final withdrawals", async function () {
    await matureAndRequest();
    await (await staking.connect(validator).withdraw(ethers.parseEther("400"))).wait();
    expect(await staking.totalStaked()).to.equal(ethers.parseEther("600"));
    await assertSolvent();
    await reverted(staking.connect(validator).withdraw(ethers.parseEther("600")), "Cooldown not finished");
    await network.provider.send("evm_increaseTime", [86401]);
    await network.provider.send("evm_mine");
    await (await staking.connect(validator).withdraw(ethers.parseEther("600"))).wait();
    expect(await staking.totalStaked()).to.equal(0n);
    expect(await token.balanceOf(await staking.getAddress())).to.equal(0n);
    await assertSolvent();
  });

  it("allows rescue of only accidentally transferred surplus ECHO", async function () {
    const excess = ethers.parseEther("25");
    await (await token.transfer(await staking.getAddress(), excess)).wait();
    expect(await staking.availableExcessEcho()).to.equal(excess);
    await reverted(staking.rescueExcessTokens(await token.getAddress(), recipient.address, excess + 1n), "Reserved ECHO cannot be rescued");
    await (await staking.rescueExcessTokens(await token.getAddress(), recipient.address, excess)).wait();
    expect(await token.balanceOf(recipient.address)).to.equal(excess);
    expect(await staking.availableExcessEcho()).to.equal(0n);
    await assertSolvent();
  });

  it("maintains backing after distributing a funded reward", async function () {
    await (await token.approve(await staking.getAddress(), rewards)).wait();
    await (await staking.fundRewards(rewards)).wait();
    const before = await token.balanceOf(validator.address);
    await (await staking.distributeReward(validator.address, ethers.parseEther("80"))).wait();
    expect(await token.balanceOf(validator.address)).to.equal(before + ethers.parseEther("80"));
    expect(await staking.rewardPool()).to.equal(ethers.parseEther("220"));
    await assertSolvent();
  });
});
