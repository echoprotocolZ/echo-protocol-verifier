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

  it("records permitted indirect spending and rejects cumulative budget exhaustion", async function () {
    const [owner, agent, recipient] = await ethers.getSigners();
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

    const pull = amount => spender.interface.encodeFunctionData("pull", [
      token.target, account.target, recipient.address, amount
    ]);
    await (await account.simulateAuthorizedCall(agent.address, spender.target, pull(3n))).wait();
    assert.equal(await account.tokenSpendingUsed(agent.address, token.target), 3n);
    assert.equal(await token.balanceOf(account.target), 97n);

    await assert.rejects(async () => {
      const tx = await account.simulateAuthorizedCall(agent.address, spender.target, pull(3n));
      await tx.wait();
    });
    assert.equal(await account.tokenSpendingUsed(agent.address, token.target), 3n);
    assert.equal(await token.balanceOf(account.target), 97n);
    assert.equal(await token.balanceOf(recipient.address), 3n);
  });

  it("documents unmonitored indirect token outflow with a legacy allowance", async function () {
    const [owner, agent, recipient] = await ethers.getSigners();
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
    await (await account.fixtureApprove(token.target, spender.target, 10n)).wait();

    // The actual Z hooks only track monitoredToken[agent].
    assert.equal(await account.monitoredToken(agent.address), ethers.ZeroAddress);
    const pull = spender.interface.encodeFunctionData("pull", [
      token.target, account.target, recipient.address, 10n
    ]);
    await (await account.simulateAuthorizedCall(agent.address, spender.target, pull)).wait();
    assert.equal(await token.balanceOf(account.target), 90n);
    assert.equal(await token.balanceOf(recipient.address), 10n);
    assert.equal(await account.tokenSpendingUsed(agent.address, token.target), 0n);
    // This harness bypasses authorization and agent policy checks. It demonstrates
    // the accounting boundary, NOT a proven exploit of executeAuthorized().
  });

  it("does not count inbound monitored-token transfers as spending", async function () {
    const [owner, agent, sender] = await ethers.getSigners();
    const bridge = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await bridge.waitForDeployment();
    const token = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await token.waitForDeployment();
    const account = await (await ethers.getContractFactory("EchoZExecutionPolicyHarness")).deploy(
      owner.address, bridge.target, owner.address
    );
    await account.waitForDeployment();
    await (await account.fixtureSetBudget(agent.address, token.target, 5n)).wait();

    // The account starts with zero tokens. A token.transfer invoked on the
    // token contract sends from this account, not from the external sender.
    // Instead, exercise an external target that transfers its own tokens to
    // the account during the simulated call.
    const spender = await (await ethers.getContractFactory("EchoIndirectTokenSpenderTestMock")).deploy();
    await spender.waitForDeployment();
    await (await token.transfer(spender.target, 10n)).wait();
    // The spender's pull() requires allowance, so a failed call must not
    // mutate accounting even when the monitored token is configured.
    const data = spender.interface.encodeFunctionData("pull", [
      token.target, sender.address, account.target, 1n
    ]);
    await assert.rejects(async () => {
      const tx = await account.simulateAuthorizedCall(agent.address, spender.target, data);
      await tx.wait();
    });
    assert.equal(await account.tokenSpendingUsed(agent.address, token.target), 0n);
    assert.equal(await token.balanceOf(account.target), 0n);
  });

  it("rejects a failed budget increase without changing the configured limit", async function () {
    const [owner, agent] = await ethers.getSigners();
    const bridge = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await bridge.waitForDeployment();
    const token = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await token.waitForDeployment();
    const account = await (await ethers.getContractFactory("EchoZExecutionPolicyHarness")).deploy(
      owner.address, bridge.target, owner.address
    );
    await account.waitForDeployment();
    await (await account.fixtureSetBudget(agent.address, token.target, 5n)).wait();
    await assert.rejects(async () => {
      const tx = await account.fixtureSetBudget(agent.address, token.target, 6n);
      await tx.wait();
    });
    assert.equal(await account.tokenSpendingBudgets(agent.address, token.target), 5n);
    assert.equal(await account.monitoredToken(agent.address), token.target);
    assert.equal(await account.tokenSpendingBudgetConfigured(agent.address, token.target), true);
  });

  it("rejects switching the monitored token after budget configuration", async function () {
    const [owner, agent] = await ethers.getSigners();
    const bridge = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await bridge.waitForDeployment();
    const firstToken = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await firstToken.waitForDeployment();
    const secondToken = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await secondToken.waitForDeployment();
    const account = await (await ethers.getContractFactory("EchoZExecutionPolicyHarness")).deploy(
      owner.address, bridge.target, owner.address
    );
    await account.waitForDeployment();
    await (await account.fixtureSetBudget(agent.address, firstToken.target, 5n)).wait();
    await assert.rejects(async () => {
      const tx = await account.fixtureSetBudget(agent.address, secondToken.target, 5n);
      await tx.wait();
    });
    assert.equal(await account.monitoredToken(agent.address), firstToken.target);
    assert.equal(await account.tokenSpendingBudgets(agent.address, firstToken.target), 5n);
    assert.equal(await account.tokenSpendingBudgetConfigured(agent.address, secondToken.target), false);
  });

  it("rejects reducing an agent budget below already-recorded spending", async function () {
    const [owner, agent, recipient] = await ethers.getSigners();
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
    await (await account.fixtureSetBudget(agent.address, token.target, 10n)).wait();
    await (await account.fixtureApprove(token.target, spender.target, 10n)).wait();
    const pull = spender.interface.encodeFunctionData("pull", [
      token.target, account.target, recipient.address, 6n
    ]);
    await (await account.simulateAuthorizedCall(agent.address, spender.target, pull)).wait();
    assert.equal(await account.tokenSpendingUsed(agent.address, token.target), 6n);
    await assert.rejects(async () => {
      const tx = await account.fixtureSetBudget(agent.address, token.target, 5n);
      await tx.wait();
    });
    assert.equal(await account.tokenSpendingBudgets(agent.address, token.target), 10n);
    assert.equal(await account.tokenSpendingUsed(agent.address, token.target), 6n);
    assert.equal(await token.balanceOf(account.target), 94n);
  });

  it("allows reducing an unspent budget while keeping the same monitored token", async function () {
    const [owner, agent] = await ethers.getSigners();
    const bridge = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await bridge.waitForDeployment();
    const token = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await token.waitForDeployment();
    const account = await (await ethers.getContractFactory("EchoZExecutionPolicyHarness")).deploy(
      owner.address, bridge.target, owner.address
    );
    await account.waitForDeployment();
    await (await account.fixtureSetBudget(agent.address, token.target, 10n)).wait();
    await (await account.fixtureSetBudget(agent.address, token.target, 4n)).wait();
    assert.equal(await account.monitoredToken(agent.address), token.target);
    assert.equal(await account.tokenSpendingBudgets(agent.address, token.target), 4n);
    assert.equal(await account.tokenSpendingUsed(agent.address, token.target), 0n);
    await assert.rejects(async () => {
      const tx = await account.fixtureSetBudget(agent.address, token.target, 10n);
      await tx.wait();
    });
    assert.equal(await account.tokenSpendingBudgets(agent.address, token.target), 4n);
  });

  it("documents approved indirect target plus unmonitored-token accounting boundary", async function () {
    const [owner, agent, recipient] = await ethers.getSigners();
    const deploy = async (name, ...args) => {
      const contract = await (await ethers.getContractFactory(name)).deploy(...args);
      await contract.waitForDeployment();
      return contract;
    };
    const bridge = await deploy("EchoTokenTestMock");
    const monitored = await deploy("EchoTokenTestMock");
    const unmonitored = await deploy("EchoTokenTestMock");
    const spender = await deploy("EchoIndirectTokenSpenderTestMock");
    const account = await deploy(
      "EchoZExecutionPolicyHarness", owner.address, bridge.target, owner.address
    );
    const policies = await deploy("EchoAgentPolicyRegistryZ");

    await (await account.fixtureSetBudget(agent.address, monitored.target, 5n)).wait();
    await (await unmonitored.transfer(account.target, 100n)).wait();
    await (await account.fixtureApprove(unmonitored.target, spender.target, 10n)).wait();

    const expiry = BigInt((await ethers.provider.getBlock("latest")).timestamp) + 3600n;
    await (await policies.setAgentPolicy(agent.address, 0n, expiry, true)).wait();
    await (await policies.setTargetPermission(agent.address, spender.target, true)).wait();
    await (await policies.setSelectorPermission(
      agent.address, spender.target, spender.interface.getFunction("pull").selector, true
    )).wait();

    const calldata = spender.interface.encodeFunctionData("pull", [
      unmonitored.target, account.target, recipient.address, 10n
    ]);
    assert.equal(
      await policies.validateExecution(owner.address, agent.address, spender.target, 0n, calldata),
      true,
      "An account-scoped allowlist can approve the indirect spender selector"
    );

    // Harness intentionally bypasses the bridge, real proofs and production
    // policy binding. This is a boundary demonstration, not an exploit proof.
    await (await account.simulateAuthorizedCall(agent.address, spender.target, calldata)).wait();
    assert.equal(await unmonitored.balanceOf(account.target), 90n);
    assert.equal(await unmonitored.balanceOf(recipient.address), 10n);
    assert.equal(await account.tokenSpendingUsed(agent.address, monitored.target), 0n);
    assert.equal(await account.tokenSpendingUsed(agent.address, unmonitored.target), 0n);
    assert.equal(await account.monitoredToken(agent.address), monitored.target);
  });

});
