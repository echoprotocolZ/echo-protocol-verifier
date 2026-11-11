const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO Z real execution-policy gate — adversarial selectors", function () {
  it("rejects approval, transferFrom and unmonitored transfer", async function () {
    const [owner, agent, recipient] = await ethers.getSigners();
    const bridgeStub = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await bridgeStub.waitForDeployment();
    const token = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await token.waitForDeployment();
    const account = await (await ethers.getContractFactory("EchoZExecutionPolicyHarness")).deploy(
      owner.address, bridgeStub.target, owner.address
    );
    await account.waitForDeployment();
    for (const [method, args] of [
      ["approve", [recipient.address, 1n]],
      ["transferFrom", [owner.address, recipient.address, 1n]],
      ["transfer", [recipient.address, 1n]]
    ]) {
      await assert.rejects(
        account.checkExecutionPolicy(
          agent.address, token.target, 0, token.interface.encodeFunctionData(method, args)
        ),
        method + " should fail the actual Z execution-policy gate"
      );
    }
  });
});
