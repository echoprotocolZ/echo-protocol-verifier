const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

// This suite verifies the production-source staking fixture and factory review gate.
// It does NOT claim to exercise the V3/V4 proof-authorized EchoSmartAccountZ
// execution path. That end-to-end proof test remains a separate release gate.
describe("Echo Z — production-source staking target integration", function () {
  const amount = ethers.parseEther("1000");
  let owner, validator, outsider, token, staking, factory;

  async function rejects(txPromise) {
    await assert.rejects(async () => { const tx = await txPromise; await tx.wait(); });
  }
  beforeEach(async function () {
    [owner, validator, outsider] = await ethers.getSigners();
    token = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await token.waitForDeployment();
    staking = await (await ethers.getContractFactory("EchoStakingSourceFixture")).deploy(token.target);
    await staking.waitForDeployment();
    factory = await (await ethers.getContractFactory("EchoAccountFactoryZ")).deploy();
    await factory.waitForDeployment();
  });

  it("requires explicit codehash and target/token approvals", async function () {
    assert.equal(await factory.isApprovedStakingTarget(staking.target), false);
    const code = await ethers.provider.getCode(staking.target);
    const hash = ethers.keccak256(code);
    await rejects(factory.setStakingTargetApproval(staking.target, token.target, true));
    await (await factory.setStakingCodehashApproval(hash, true)).wait();
    assert.equal(await factory.isApprovedStakingTarget(staking.target), false);
    await (await factory.setStakingTargetApproval(staking.target, token.target, true)).wait();
    assert.equal(await factory.isApprovedStakingTarget(staking.target), true);
    assert.equal(await factory.approvedStakingTargetToken(staking.target), token.target);
    await (await factory.setStakingTargetApproval(staking.target, token.target, false)).wait();
    assert.equal(await factory.isApprovedStakingTarget(staking.target), false);
  });

  it("rejects non-authority approval and codehash revocation bypass", async function () {
    const hash = ethers.keccak256(await ethers.provider.getCode(staking.target));
    await rejects(factory.connect(outsider).setStakingCodehashApproval(hash, true));
    await (await factory.setStakingCodehashApproval(hash, true)).wait();
    await rejects(factory.connect(outsider).setStakingTargetApproval(staking.target, token.target, true));
    await (await factory.setStakingTargetApproval(staking.target, token.target, true)).wait();
    await (await factory.setStakingCodehashApproval(hash, false)).wait();
    assert.equal(await factory.isApprovedStakingTarget(staking.target), false);
  });

  it("rejects mismatched token for the reviewed staking target", async function () {
    const otherToken = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await otherToken.waitForDeployment();
    const hash = ethers.keccak256(await ethers.provider.getCode(staking.target));
    await (await factory.setStakingCodehashApproval(hash, true)).wait();
    await rejects(factory.setStakingTargetApproval(staking.target, otherToken.target, true));
    assert.equal(await factory.isApprovedStakingTarget(staking.target), false);
  });

  it("stakes from a contract address with exact allowance and zero remaining approval", async function () {
    const proxy = await (await ethers.getContractFactory("EchoStakingContractCallerFixture")).deploy(token.target, staking.target);
    await proxy.waitForDeployment();
    await (await token.mint(proxy.target, amount)).wait();
    await (await proxy.stakeExact(amount)).wait();
    assert.equal(await staking.getValidatorStake(proxy.target), amount);
    assert.equal(await token.balanceOf(staking.target), amount);
    assert.equal(await token.allowance(proxy.target, staking.target), 0n);
    assert.equal(await staking.isValidatorActive(proxy.target), true);
  });

  it("rejects a contract caller staking less than the minimum and rolls back allowance", async function () {
    const proxy = await (await ethers.getContractFactory("EchoStakingContractCallerFixture")).deploy(token.target, staking.target);
    await proxy.waitForDeployment();
    await (await token.mint(proxy.target, amount)).wait();
    await rejects(proxy.stakeExact(amount - 1n));
    assert.equal(await token.allowance(proxy.target, staking.target), 0n);
    assert.equal(await token.balanceOf(proxy.target), amount);
    assert.equal(await staking.totalStaked(), 0n);
  });
});
