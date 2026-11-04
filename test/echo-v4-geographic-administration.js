const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ECHO V4 geographic administration security", function () {
  let owner, outsider, account, registry, policy;

  const zone = {
    minLat: 1200000000,
    maxLat: 1210000000,
    minLon: 2400000000,
    maxLon: 2410000000
  };

  beforeEach(async function () {
    [owner, outsider] = await ethers.getSigners();

    registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    policy = await (
      await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")
    ).deploy();

    const geographicVerifier = await (
      await ethers.getContractFactory("EchoGeographicBoundVerifierV4")
    ).deploy();

    const gateway = await (
      await ethers.getContractFactory("EchoGeographicProofGatewayV4")
    ).deploy(geographicVerifier.target, policy.target);

    const v3Verifier = await (
      await ethers.getContractFactory("EchoAuthorizationVerifierV3")
    ).deploy();

    const v3Bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV3")
    ).deploy(v3Verifier.target, registry.target);

    const dualVerifier = await (
      await ethers.getContractFactory("EchoDualProofVerifierV4")
    ).deploy(v3Bridge.target, gateway.target);

    const v4Bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV4")
    ).deploy(dualVerifier.target, registry.target);

    account = await (
      await ethers.getContractFactory("EchoSmartAccountV4")
    ).deploy(owner.address, ethers.ZeroAddress, v4Bridge.target);
  });

  it("allows the owner to configure an approved geographic zone", async function () {
    const data = policy.interface.encodeFunctionData(
      "setGeographicPolicy", [owner.address, zone]
    );

    await account.executeGeographicAdministration(data);

    const saved = await policy.getGeographicPolicy(
      account.target, owner.address
    );

    expect(saved.enabled).to.equal(true);
    expect(saved.zone.minLat).to.equal(BigInt(zone.minLat));
  });

  it("rejects unauthorized geographic administration", async function () {
    const data = policy.interface.encodeFunctionData(
      "setGeographicPolicy", [owner.address, zone]
    );

    let rejected = false;
    try {
      await (await account.connect(outsider).executeGeographicAdministration(data)).wait();
    } catch (error) {
      rejected = true;
    }
    expect(rejected).to.equal(true);
  });

  it("allows the owner to disable a geographic policy", async function () {
    await account.executeGeographicAdministration(
      policy.interface.encodeFunctionData(
        "setGeographicPolicy", [owner.address, zone]
      )
    );

    await account.executeGeographicAdministration(
      policy.interface.encodeFunctionData(
        "disableGeographicPolicy", [owner.address]
      )
    );

    const saved = await policy.getGeographicPolicy(
      account.target, owner.address
    );

    expect(saved.enabled).to.equal(false);
  });

  it("rejects unsupported geographic administration calls", async function () {
    const data = policy.interface.encodeFunctionData(
      "getGeographicPolicy", [account.target, owner.address]
    );

    let rejected = false;
    try {
      await (await account.executeGeographicAdministration(data)).wait();
    } catch (error) {
      rejected = true;
    }
    expect(rejected).to.equal(true);
  });
});
