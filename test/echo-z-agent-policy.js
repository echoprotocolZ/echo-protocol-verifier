const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("Echo Z AI agent policy security", function () {
  let registry, account, agent, outsider, target;

  beforeEach(async function () {
    [account, agent, outsider, target] =
      await ethers.getSigners();

    registry = await (
      await ethers.getContractFactory("EchoAgentPolicyRegistryZ")
    ).deploy();

    await registry.waitForDeployment();
  });

  it("enforces destination, selector, spending, and expiration", async function () {
    const latest = await ethers.provider.getBlock("latest");
    const expiration = latest.timestamp + 3600;

    const selector = "0xa9059cbb";
    const data = selector + "00".repeat(64);

    await (
      await registry.connect(account).setAgentPolicy(
        agent.address,
        ethers.parseEther("0.1"),
        expiration,
        true
      )
    ).wait();

    await (
      await registry.connect(account).setTargetPermission(
        agent.address,
        target.address,
        true
      )
    ).wait();

    await (
      await registry.connect(account).setSelectorPermission(
        agent.address,
        target.address,
        selector,
        true
      )
    ).wait();

    assert.equal(
      await registry.validateExecution(
        account.address,
        agent.address,
        target.address,
        ethers.parseEther("0.05"),
        data
      ),
      true
    );

    async function rejects(targetAddress, value, calldata) {
      await assert.rejects(
        registry.validateExecution(
          account.address,
          agent.address,
          targetAddress,
          value,
          calldata
        )
      );
    }

    await rejects(
      outsider.address,
      0n,
      data
    );

    await rejects(
      target.address,
      ethers.parseEther("0.2"),
      data
    );

    await rejects(
      target.address,
      0n,
      "0x12345678"
    );

    await rejects(
      target.address,
      0n,
      "0x"
    );

    await (
      await registry.connect(account).setAgentPolicy(
        agent.address,
        ethers.parseEther("0.1"),
        expiration,
        false
      )
    ).wait();

    await rejects(target.address, 0n, data);

    console.log("PASS: destination, selector, spending, revocation");
  });

  it("prevents cross-account policy modification", async function () {
    const latest = await ethers.provider.getBlock("latest");
    const expiration = latest.timestamp + 3600;

    await (
      await registry.connect(account).setAgentPolicy(
        agent.address, 100n, expiration, true
      )
    ).wait();

    await (
      await registry.connect(outsider).setAgentPolicy(
        agent.address, 999999n, expiration, true
      )
    ).wait();

    const original = await registry.agentPolicies(
      account.address,
      agent.address
    );

    assert.equal(original.maxValuePerTransaction, 100n);

    const outsiderPolicy = await registry.agentPolicies(
      outsider.address,
      agent.address
    );

    assert.equal(
      outsiderPolicy.maxValuePerTransaction,
      999999n
    );

    console.log("PASS: account-scoped policy isolation");
  });

  it("rejects expired agent policies", async function () {
    const latest = await ethers.provider.getBlock("latest");

    await assert.rejects(async () => {
      const tx = await registry.connect(account).setAgentPolicy(
        agent.address,
        100n,
        latest.timestamp,
        true
      );
      await tx.wait();
    });

    console.log("PASS: expired policy rejected");
  });
});
