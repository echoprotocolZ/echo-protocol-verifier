const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("Echo Z staking integration — local contracts", function () {
  it("approves and stakes ECHO, rejecting below-minimum stakes", async function () {
    const [owner] = await ethers.getSigners();

    const token = await (
      await ethers.getContractFactory("EchoTokenTestMock")
    ).deploy();
    await token.waitForDeployment();

    const staking = await (
      await ethers.getContractFactory("EchoStakingTestMock")
    ).deploy(token.target);
    await staking.waitForDeployment();

    const amount = ethers.parseUnits("1000", 18);

    assert.equal(await staking.echoToken(), token.target);
    assert.equal(await staking.MIN_STAKE(), amount);

    const approveData = token.interface.encodeFunctionData(
      "approve", [staking.target, amount]
    );

    const stakeData = staking.interface.encodeFunctionData(
      "stake", [amount]
    );

    assert.equal(
      token.interface.parseTransaction({ data: approveData }).name,
      "approve"
    );
    assert.equal(
      staking.interface.parseTransaction({ data: stakeData }).name,
      "stake"
    );

    await (await token.approve(staking.target, amount)).wait();

    let rejected = false;
    try {
      const tx = await staking.stake(amount - 1n);
      await tx.wait();
    } catch {
      rejected = true;
    }

    assert.equal(rejected, true, "Below-minimum stake must revert");

    await (await staking.stake(amount)).wait();

    assert.equal(
      await staking.getValidatorStake(owner.address),
      amount
    );

    assert.equal(
      await token.balanceOf(staking.target),
      amount
    );

    console.log("PASS: ERC-20 approval");
    console.log("PASS: Minimum stake enforced");
    console.log("PASS: 1,000 ECHO staked");
    console.log("PASS: Z-compatible calldata encoded");
  });
});
