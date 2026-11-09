const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("Echo Z token-spending security", function () {
  it("rejects excessive ERC-20 approvals", async function () {
    const [account, agent, spender] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAgentPolicyRegistryZ")
    ).deploy();
    await registry.waitForDeployment();

    const token = await (
      await ethers.getContractFactory("EchoTokenTestMock")
    ).deploy();
    await token.waitForDeployment();

    const block = await ethers.provider.getBlock("latest");

    await registry.connect(account).setAgentPolicy(
      agent.address,
      0,
      BigInt(block.timestamp) + 3600n,
      true
    );

    await registry.connect(account).setTargetPermission(
      agent.address,
      token.target,
      true
    );

    await registry.connect(account).setSelectorPermission(
      agent.address,
      token.target,
      token.interface.getFunction("approve").selector,
      true
    );

    const excessiveApproval = token.interface.encodeFunctionData(
      "approve",
      [spender.address, ethers.parseEther("1000000")]
    );

    await assert.rejects(async () => {
      await registry.validateExecution(
        account.address,
        agent.address,
        token.target,
        0,
        excessiveApproval
      );
    }, "Excessive ECHO approval must be rejected");
  });
});
