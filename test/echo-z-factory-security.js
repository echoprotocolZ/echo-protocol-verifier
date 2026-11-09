const { expect } = require("chai");
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("Echo Protocol Z factory authorization", function () {
  let owner, attacker, factory, bridgePlaceholder, salt, deadline;
  let agentPolicyRegistry;
  let targets, calls, predicted, domain, types, message;

  beforeEach(async function () {
    agentPolicyRegistry = await (
      await ethers.getContractFactory("EchoAgentPolicyRegistryZ")
    ).deploy();
    await agentPolicyRegistry.waitForDeployment();

    [owner, attacker] = await ethers.getSigners();

    factory = await (
      await ethers.getContractFactory("EchoAccountFactoryZ")
    ).deploy();
    await factory.waitForDeployment();

    bridgePlaceholder = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();
    await bridgePlaceholder.waitForDeployment();

    salt = ethers.id("echo-z-security-test");
    deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;

    targets = Array(5).fill(await bridgePlaceholder.getAddress());
    calls = Array(5).fill("0x12345678");

    predicted = await factory.predictAccountAddress(
      owner.address,
      ethers.ZeroAddress,
      await bridgePlaceholder.getAddress(),
      salt
    );

    const network = await ethers.provider.getNetwork();

    domain = {
      name: "EchoAccountFactoryZ",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await factory.getAddress()
    };

    types = {
      Deploy: [
        { name: "owner", type: "address" },
        { name: "entryPoint", type: "address" },
        { name: "bridge", type: "address" },
        { name: "agentPolicyRegistry", type: "address" },
        { name: "salt", type: "bytes32" },
        { name: "configHash", type: "bytes32" },
        { name: "deadline", type: "uint256" }
      ]
    };

    message = {
      owner: owner.address,
      entryPoint: ethers.ZeroAddress,
      bridge: await bridgePlaceholder.getAddress(),
      agentPolicyRegistry: await agentPolicyRegistry.getAddress(),
      salt,
      configHash: await factory.configurationHash(targets, calls),
      deadline
    };
  });

  async function deploy(signature, expiry = deadline) {
    return factory.createAccount(
      owner.address,
      ethers.ZeroAddress,
      await bridgePlaceholder.getAddress(),
      await agentPolicyRegistry.getAddress(),
      salt,
      targets,
      calls,
      expiry,
      signature
    );
  }

  it("rejects a signature from an unauthorized signer", async function () {
    const signature = await attacker.signTypedData(domain, types, message);

    await assert.rejects(
      async () => {
        const tx = await deploy(signature);
        await tx.wait();
      },
      /InvalidSignature/
    );

    expect(await ethers.provider.getCode(predicted)).to.equal("0x");
  });

  it("rejects an expired authorization", async function () {
    const expired = {
      ...message,
      deadline: (await ethers.provider.getBlock("latest")).timestamp - 1
    };

    const signature = await owner.signTypedData(domain, types, expired);

    await assert.rejects(
      async () => {
        const tx = await deploy(signature, expired.deadline);
        await tx.wait();
      },
      /AuthorizationExpired/
    );

    expect(await ethers.provider.getCode(predicted)).to.equal("0x");
  });

  it("rolls back deployment when initialization fails", async function () {
    const signature = await owner.signTypedData(domain, types, message);

    await assert.rejects(async () => {
      const tx = await deploy(signature);
      await tx.wait();
    });

    expect(await ethers.provider.getCode(predicted)).to.equal("0x");
  });
});
