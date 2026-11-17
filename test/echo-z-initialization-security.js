const { expect } = require("chai");
const { ethers } = require("hardhat");
const assert = require("node:assert/strict");

describe("ECHO Z initialization security", function () {
  it("rejects unauthorized initialization", async function () {
    const [owner, factory, attacker] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountZ")
    ).deploy(
      owner.address,
      ethers.ZeroAddress,
      registry.target,
      factory.address
    );

    await assert.rejects(
      async () => {
        const tx = await account.connect(attacker).initialize([], []);
        await tx.wait();
      },
      /OnlyDeploymentFactory/
    );

    expect(await account.initialized()).to.equal(false);
  });

  it("rejects invalid factory initialization without changing state", async function () {
    const [owner, factory] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountZ")
    ).deploy(
      owner.address,
      ethers.ZeroAddress,
      registry.target,
      factory.address
    );

    await assert.rejects(
      async () => {
        const tx = await account.connect(factory).initialize([], []);
        await tx.wait();
      },
      /InvalidInitializationCall/
    );

    expect(await account.initialized()).to.equal(false);
  });
});

describe("ECHO Z factory binding security", function () {
  it("prevents outsiders from binding the agent policy registry", async function () {
    const [owner, factory, attacker] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountZ")
    ).deploy(
      owner.address,
      ethers.ZeroAddress,
      registry.target,
      factory.address
    );

    await assert.rejects(
      async () => {
        const tx = await account.connect(attacker)
          .bindAgentPolicyRegistry(registry.target);
        await tx.wait();
      },
      /Unauthorized/
    );

    expect(await account.agentPolicyRegistry())
      .to.equal(ethers.ZeroAddress);

    expect(await account.deploymentFactory())
      .to.equal(factory.address);
  });

  it("prevents rebinding an already configured registry", async function () {
    const [owner, factory] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountZ")
    ).deploy(
      owner.address,
      ethers.ZeroAddress,
      registry.target,
      factory.address
    );

    await (
      await account.connect(factory)
        .bindAgentPolicyRegistry(registry.target)
    ).wait();

    await assert.rejects(
      async () => {
        const tx = await account.connect(factory)
          .bindAgentPolicyRegistry(registry.target);
        await tx.wait();
      },
      /AgentPolicyRegistryAlreadyBound/
    );

    expect(await account.agentPolicyRegistry())
      .to.equal(registry.target);
  });
});
