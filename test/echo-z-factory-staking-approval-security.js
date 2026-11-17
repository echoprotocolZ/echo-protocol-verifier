const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("Echo Z factory — staking approval and authority security", function () {
  async function deploy(name, ...args) {
    const c = await (await ethers.getContractFactory(name)).deploy(...args);
    await c.waitForDeployment();
    return c;
  }

  it("requires codehash and exact token/target approval, supports revocation", async function () {
    const [authority, outsider] = await ethers.getSigners();
    const factory = await deploy("EchoAccountFactoryZ");
    const token = await deploy("EchoTokenTestMock");
    const otherToken = await deploy("EchoTokenTestMock");
    const staking = await deploy("EchoStakingSourceFixture", token.target);
    const twin = await deploy("EchoStakingSourceFixture", otherToken.target);
    const hash = ethers.keccak256(await ethers.provider.getCode(staking.target));
    assert.equal(await factory.isApprovedStakingTarget(staking.target), false);
    await assert.rejects(async () => {
      await (await factory.setStakingTargetApproval(staking.target, token.target, true)).wait();
    });
    await assert.rejects(async () => {
      await (await factory.connect(outsider).setStakingCodehashApproval(hash, true)).wait();
    });
    await (await factory.setStakingCodehashApproval(hash, true)).wait();
    await assert.rejects(async () => {
      await (await factory.setStakingTargetApproval(staking.target, otherToken.target, true)).wait();
    });
    await (await factory.setStakingTargetApproval(staking.target, token.target, true)).wait();
    assert.equal(await factory.isApprovedStakingTarget(staking.target), true);
    assert.equal(await factory.isApprovedStakingTarget(twin.target), false);
    await (await factory.setStakingCodehashApproval(hash, false)).wait();
    assert.equal(await factory.isApprovedStakingTarget(staking.target), false);
    await (await factory.setStakingCodehashApproval(hash, true)).wait();
    assert.equal(await factory.isApprovedStakingTarget(staking.target), true);
    await (await factory.setStakingTargetApproval(staking.target, token.target, false)).wait();
    assert.equal(await factory.isApprovedStakingTarget(staking.target), false);
    assert.equal(await factory.approvedStakingTargetToken(staking.target), ethers.ZeroAddress);
    assert.equal(await factory.approvedStakingTargetCodehash(staking.target), ethers.ZeroHash);
    assert.equal(await factory.stakingCodeAuthority(), authority.address);
  });

  it("prevents unauthorized authority takeover and enforces two-step transfer", async function () {
    const [authority, successor, outsider] = await ethers.getSigners();
    const factory = await deploy("EchoAccountFactoryZ");
    await assert.rejects(async () => {
      await (await factory.connect(outsider).transferStakingCodeAuthority(outsider.address)).wait();
    });
    await assert.rejects(async () => {
      await (await factory.transferStakingCodeAuthority(ethers.ZeroAddress)).wait();
    });
    await (await factory.transferStakingCodeAuthority(successor.address)).wait();
    assert.equal(await factory.stakingCodeAuthority(), authority.address);
    assert.equal(await factory.pendingStakingCodeAuthority(), successor.address);
    await assert.rejects(async () => {
      await (await factory.connect(outsider).acceptStakingCodeAuthority()).wait();
    });
    await (await factory.cancelStakingCodeAuthorityTransfer()).wait();
    assert.equal(await factory.pendingStakingCodeAuthority(), ethers.ZeroAddress);
    await assert.rejects(async () => {
      await (await factory.connect(successor).acceptStakingCodeAuthority()).wait();
    });
    await (await factory.transferStakingCodeAuthority(successor.address)).wait();
    await (await factory.connect(successor).acceptStakingCodeAuthority()).wait();
    assert.equal(await factory.stakingCodeAuthority(), successor.address);
    assert.equal(await factory.pendingStakingCodeAuthority(), ethers.ZeroAddress);
    const token = await deploy("EchoTokenTestMock");
    const staking = await deploy("EchoStakingSourceFixture", token.target);
    const hash = ethers.keccak256(await ethers.provider.getCode(staking.target));
    await assert.rejects(async () => {
      await (await factory.setStakingCodehashApproval(hash, true)).wait();
    });
    await (await factory.connect(successor).setStakingCodehashApproval(hash, true)).wait();
    assert.equal(await factory.approvedStakingCodehash(hash), true);
  });
});
