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


    // Verify the 90-day staking lock.
    assert.equal(
      await staking.LOCK_PERIOD(),
      90n * 24n * 60n * 60n
    );

    // Verify the 24-hour unbonding period.
    assert.equal(
      await staking.UNBONDING_PERIOD(),
      24n * 60n * 60n
    );

    // Withdrawal must fail before an unstake request.
    await assert.rejects(async () => {
      const tx = await staking.withdraw(amount);
      await tx.wait();
    });

    console.log("PASS: Staking lock configuration");
    console.log("PASS: Unbonding period configuration");
    console.log("PASS: Withdrawal without unstaking rejected");


    // Reject unstaking before the 90-day lock expires.
    await assert.rejects(async () => {
      const tx = await staking.requestUnstake();
      await tx.wait();
    });

    console.log("PASS: Early unstaking rejected");


    // Advance the local blockchain past the 90-day lock.
    const validator = await staking.validators(owner.address);
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(validator.unlockTime) + 1
    ]);
    await ethers.provider.send("evm_mine", []);

    await (await staking.requestUnstake()).wait();
    console.log("PASS: Unstaking permitted after 90 days");

    // Withdrawal must fail during the 24-hour unbonding period.
    await assert.rejects(async () => {
      const tx = await staking.withdraw(amount);
      await tx.wait();
    });
    console.log("PASS: Early withdrawal during unbonding rejected");

    const pending = await staking.validators(owner.address);
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(pending.unstakeRequestedAt) + 86401
    ]);
    await ethers.provider.send("evm_mine", []);

    await (await staking.withdraw(amount)).wait();

    assert.equal(await staking.getValidatorStake(owner.address), 0n);
    assert.equal(await token.balanceOf(staking.target), 0n);
    assert.equal(await token.balanceOf(owner.address), await token.totalSupply());

    console.log("PASS: Withdrawal after 24-hour unbonding");
    console.log("PASS: Full token balance returned");
    console.log("PASS: ERC-20 approval");
    console.log("PASS: Minimum stake enforced");
    console.log("PASS: 1,000 ECHO staked");
    console.log("PASS: Z-compatible calldata encoded");
  });
});
