const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Echo V3 authorization bridge", function () {
  it("rejects deployment with invalid verifier or registry", async function () {
    const Bridge = await ethers.getContractFactory(
      "EchoAuthorizationBridgeV3"
    );

    let rejected = false;

    try {
      const bridge = await Bridge.deploy(
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      await bridge.waitForDeployment();
    } catch (error) {
      rejected = true;
      expect(String(error)).to.include("InvalidContract");
    }

    expect(rejected).to.equal(true);
  });
});
