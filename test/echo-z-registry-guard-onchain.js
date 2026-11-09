const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Echo Z on-chain AI registry guard", function () {
  it("rejects its own policy registry with Unauthorized()", async function () {
    const [owner, agent] = await ethers.getSigners();

    const deploy = async (name, ...args) => {
      const contract = await (
        await ethers.getContractFactory(name)
      ).deploy(...args);
      await contract.waitForDeployment();
      return contract;
    };

    const registry = await deploy("EchoAgentPolicyRegistryZ");
    const bridge = await deploy("EchoAttestationRegistryV3");

    const account = await deploy(
      "EchoSmartAccountZPolicyHarness",
      owner.address,
      ethers.ZeroAddress,
      bridge.target,
      owner.address
    );

    // The harness requires a bound registry before
    // its policy-validation hook can be tested.
    await (
      await account.bindAgentPolicyRegistry(registry.target)
    ).wait();

    const data = registry.interface.encodeFunctionData(
      "setAgentPolicy",
      [agent.address, 1000n, 9999999999n, true]
    );


    const expectedError =
      account.interface.getError("Unauthorized").selector;

    let rejected = false;

    try {
      await account.testValidateExecutionPolicy(
        agent.address,
        registry.target,
        0,
        data
      );
    } catch (error) {
      const revertData =
        error.data ??
        error.error?.data ??
        error.info?.error?.data;

      if (revertData !== expectedError) {
        throw error;
      }

      rejected = true;
    }

    if (!rejected) {
      throw new Error("SECURITY FAILURE: Registry call was allowed");
    }

    console.log(
      "PASS: AI registry target rejected by account policy guard"
    );
  });
});
