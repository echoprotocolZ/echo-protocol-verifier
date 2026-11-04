const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ECHO V3 reentrancy security", function () {
  let owner, outsider, account, probe;

  beforeEach(async function () {
    [owner, outsider] = await ethers.getSigners();

    const MockVerifier = await ethers.getContractFactory(
      "MockVerifier"
    );

    const Registry = await ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );

    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Bridge = await ethers.getContractFactory(
      "EchoAuthorizationBridgeV3"
    );

    // Use an existing verifier contract if the mock is available.
    const verifier = MockVerifier
      ? await MockVerifier.deploy()
      : null;

    if (verifier) await verifier.waitForDeployment();

    const bridge = await Bridge.deploy(
      verifier.target,
      registry.target
    );
    await bridge.waitForDeployment();

    const Account = await ethers.getContractFactory(
      "EchoSmartAccountV3"
    );

    account = await Account.deploy(
      owner.address,
      ethers.ZeroAddress,
      bridge.target
    );
    await account.waitForDeployment();

    const Probe = await ethers.getContractFactory(
      "EchoReentrancyProbeV3"
    );

    probe = await Probe.deploy(account.target);
    await probe.waitForDeployment();
  });

  it("rejects administrative callbacks through an external contract", async function () {
    const encodedAdminCall = account.interface.encodeFunctionData(
      "setEntryPoint",
      [outsider.address]
    );

    await probe.attemptCallback(encodedAdminCall);

    expect(await probe.callbackSucceeded()).to.equal(false);
    expect(await account.entryPoint()).to.equal(ethers.ZeroAddress);
    expect(await account.owner()).to.equal(owner.address);
  });
});
