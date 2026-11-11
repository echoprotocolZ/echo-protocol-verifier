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


    // Configure a legitimate spender and a 1,000 ECHO limit.
    await registry.connect(account).setTokenApprovalLimit(
      agent.address,
      token.target,
      spender.address,
      ethers.parseEther("1000")
    );

    const allowedApproval = token.interface.encodeFunctionData(
      "approve",
      [spender.address, ethers.parseEther("1000")]
    );

    assert.equal(
      await registry.validateExecution(
        account.address, agent.address, token.target, 0, allowedApproval
      ),
      true
    );

    const [, unauthorizedSpender] = await ethers.getSigners();
    const otherSpender = (await ethers.getSigners())[3];

    const unauthorizedApproval = token.interface.encodeFunctionData(
      "approve",
      [otherSpender.address, ethers.parseEther("1000")]
    );

    await assert.rejects(async () => {
      await registry.validateExecution(
        account.address,
        agent.address,
        token.target,
        0,
        unauthorizedApproval
      );
    });

    console.log("PASS: Authorized 1,000 ECHO approval");
    console.log("PASS: Unauthorized spender rejected");

    // A view-only policy cannot track cumulative approvals.
    const repeatedApprovalAllowed = await registry.validateExecution(
      account.address,
      agent.address,
      token.target,
      0,
      allowedApproval
    );

    assert.equal(repeatedApprovalAllowed, true);

    console.log("CONFIRMED: Repeated approval passes stateless policy");


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
  it("documents that an allowlisted unprotected ERC-20 transfer passes registry policy", async function () {
    const [account, agent, recipient] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAgentPolicyRegistryZ")).deploy();
    await registry.waitForDeployment();
    const token = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await token.waitForDeployment();
    const block = await ethers.provider.getBlock("latest");
    await registry.connect(account).setAgentPolicy(agent.address, 0, BigInt(block.timestamp) + 3600n, true);
    await registry.connect(account).setTargetPermission(agent.address, token.target, true);
    await registry.connect(account).setSelectorPermission(
      agent.address, token.target, token.interface.getFunction("transfer").selector, true
    );
    const transfer = token.interface.encodeFunctionData("transfer", [recipient.address, 1n]);

    // This documents the registry permission boundary, not an end-to-end exploit.
    assert.equal(
      await registry.validateExecution(account.address, agent.address, token.target, 0, transfer),
      true
    );

    await registry.connect(account).setProtectedToken(token.target, true);
    await assert.rejects(
      registry.validateExecution(account.address, agent.address, token.target, 0, transfer)
    );
  });

});
