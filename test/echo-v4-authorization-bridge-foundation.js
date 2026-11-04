const { expect } = require("chai");
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO V4 Authorization Bridge Foundation", function () {
  let Bridge;
  let dependencyA;
  let dependencyB;

  beforeEach(async function () {
    Bridge = await ethers.getContractFactory(
      "EchoAuthorizationBridgeV4"
    );

    const Mock = await ethers.getContractFactory(
      "EchoDualProofTestMockV4"
    );

    dependencyA = await Mock.deploy();
    await dependencyA.waitForDeployment();

    dependencyB = await Mock.deploy();
    await dependencyB.waitForDeployment();
  });

  it("accepts deployed contract dependencies", async function () {
    const bridge = await Bridge.deploy(
      await dependencyA.getAddress(),
      await dependencyB.getAddress()
    );

    await bridge.waitForDeployment();

    expect(await bridge.dualProofVerifier()).to.equal(
      await dependencyA.getAddress()
    );

    expect(await bridge.checkpointRegistry()).to.equal(
      await dependencyB.getAddress()
    );
  });

  it("rejects a zero dual-proof verifier address", async function () {
    await assert.rejects(
      Bridge.deploy(
        ethers.ZeroAddress,
        await dependencyB.getAddress()
      )
    );
  });

  it("rejects a zero checkpoint registry address", async function () {
    await assert.rejects(
      Bridge.deploy(
        await dependencyA.getAddress(),
        ethers.ZeroAddress
      )
    );
  });

  it("rejects an undeployed verifier address", async function () {
    const [signer] = await ethers.getSigners();

    await assert.rejects(
      Bridge.deploy(
        signer.address,
        await dependencyB.getAddress()
      )
    );
  });

  it("rejects an undeployed registry address", async function () {
    const [signer] = await ethers.getSigners();

    await assert.rejects(
      Bridge.deploy(
        await dependencyA.getAddress(),
        signer.address
      )
    );
  });
});
