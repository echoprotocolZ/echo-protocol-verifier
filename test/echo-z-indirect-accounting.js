const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO Z indirect token accounting — isolated production hooks", function () {
  it("rolls back an indirect monitored-token outflow over budget", async function () {
    const [owner, agent, attacker] = await ethers.getSigners();
    const bridge = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await bridge.waitForDeployment();
    const token = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await token.waitForDeployment();
    const spender = await (await ethers.getContractFactory("EchoIndirectTokenSpenderTestMock")).deploy();
    await spender.waitForDeployment();
    const account = await (await ethers.getContractFactory("EchoZExecutionPolicyHarness")).deploy(
      owner.address, bridge.target, owner.address
    );
    await account.waitForDeployment();
    await (await token.transfer(account.target, 100n)).wait();

    // A legacy allowance cannot be created through the hardened agent policy.
    // Use a separate local fixture to establish the allowance precondition.
    assert.equal(await token.allowance(account.target, spender.target), 0n);
    const data = spender.interface.encodeFunctionData("pull", [
      token.target, account.target, attacker.address, 10n
    ]);
    await assert.rejects(async () => {
      const tx = await account.simulateAuthorizedCall(agent.address, spender.target, data);
      await tx.wait();
    });
    assert.equal(await token.balanceOf(account.target), 100n);
    assert.equal(await token.balanceOf(attacker.address), 0n);
  });
  it("reverts an over-budget indirect pull with a pre-existing allowance", async function () {
    const [owner, agent, attacker] = await ethers.getSigners();
    const bridge = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await bridge.waitForDeployment();
    const token = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await token.waitForDeployment();
    const spender = await (await ethers.getContractFactory("EchoIndirectTokenSpenderTestMock")).deploy();
    await spender.waitForDeployment();
    const account = await (await ethers.getContractFactory("EchoZExecutionPolicyHarness")).deploy(
      owner.address, bridge.target, owner.address
    );
    await account.waitForDeployment();
    await (await token.transfer(account.target, 100n)).wait();
    await (await account.fixtureSetBudget(agent.address, token.target, 5n)).wait();
    await (await account.fixtureApprove(token.target, spender.target, 10n)).wait();
    assert.equal(await token.allowance(account.target, spender.target), 10n);

    const data = spender.interface.encodeFunctionData("pull", [
      token.target, account.target, attacker.address, 10n
    ]);
    await assert.rejects(async () => {
      const tx = await account.simulateAuthorizedCall(agent.address, spender.target, data);
      await tx.wait();
    }, "The actual post-execution budget hook must reject an indirect 10-token outflow");

    assert.equal(await token.balanceOf(account.target), 100n);
    assert.equal(await token.balanceOf(attacker.address), 0n);
    assert.equal(await token.allowance(account.target, spender.target), 10n);
    assert.equal(await account.tokenSpendingUsed(agent.address, token.target), 0n);
  });

});
