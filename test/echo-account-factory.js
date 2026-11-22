const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Echo Protocol Z CREATE2 Factory", function () {
  it("predicts and deploys the correct account address", async function () {
    const [owner] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Bridge = await ethers.getContractFactory(
      "EchoAuthorizationBridgeV4"
    );

    // Factory test uses an existing deployed contract as
    // a constructor-compatible bridge placeholder.
    // This does not test authorization functionality.
    const Factory = await ethers.getContractFactory(
      "EchoAccountFactory"
    );
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const salt = ethers.id("echo-protocol-z-test-1");
    const predicted = await factory.predictAccountAddress(
      owner.address,
      ethers.ZeroAddress,
      await registry.getAddress(),
      salt
    );

    await (
      await factory.createAccount(
        owner.address,
        ethers.ZeroAddress,
        await registry.getAddress(),
        salt
      )
    ).wait();

    expect(await ethers.provider.getCode(predicted)).to.not.equal("0x");

    const account = await ethers.getContractAt(
      "EchoSmartAccountV4",
      predicted
    );

    expect(await account.owner()).to.equal(owner.address);
    expect(await account.authorizationBridge()).to.equal(
      await registry.getAddress()
    );
  });
});
