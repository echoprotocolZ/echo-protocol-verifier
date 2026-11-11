const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO Z agent policy — indirect token call boundary", function () {
  it("allows an explicitly approved indirect spender selector without inspecting nested token outflow", async function () {
    const [account, agent, recipient] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAgentPolicyRegistryZ")).deploy();
    await registry.waitForDeployment();
    const token = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await token.waitForDeployment();
    const spender = await (await ethers.getContractFactory("EchoIndirectTokenSpenderTestMock")).deploy();
    await spender.waitForDeployment();

    const expiresAt = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
    await (await registry.setAgentPolicy(agent.address, 0n, expiresAt, true)).wait();
    await (await registry.setTargetPermission(agent.address, spender.target, true)).wait();
    const data = spender.interface.encodeFunctionData("pull", [
      token.target, account.address, recipient.address, 10n
    ]);
    await (await registry.setSelectorPermission(
      agent.address, spender.target, data.slice(0, 10), true
    )).wait();

    assert.equal(await registry.validateExecution(
      account.address, agent.address, spender.target, 0n, data
    ), true);

    // This is a registry-only check, NOT a proof-authorized Z execution.
    // The registry permits the outer spender call but does not inspect its
    // internal transferFrom. Pre-existing allowances remain a separate risk.
    const direct = token.interface.encodeFunctionData("approve", [
      spender.target, 10n
    ]);
    await assert.rejects(registry.validateExecution(
      account.address, agent.address, token.target, 0n, direct
    ));
  });
});
