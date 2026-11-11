const { expect } = require("chai");
const { ethers } = require("hardhat");
const assert = require("node:assert/strict");

describe("ECHO V4 zero-trust hardening", function () {
  it("rejects owner entry-point changes without protocol authorization", async function () {
    const [owner, outsider] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountV4")
    ).deploy(owner.address, ethers.ZeroAddress, registry.target);

    await assert.rejects(
      async () => {
        const tx = await account.connect(owner).setEntryPoint(outsider.address);
        await tx.wait();
      }
    );

    expect(await account.entryPoint()).to.equal(ethers.ZeroAddress);
  });
});

describe("ECHO V4 administrative zero-trust regression", function () {
  it("rejects owner validator changes without V3/V4 authorization", async function () {
    const assert = require("node:assert/strict");
    const [owner, validator] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const v3Verifier = await (
      await ethers.getContractFactory("EchoAuthorizationVerifierV3")
    ).deploy();
    const v3Bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV3")
    ).deploy(v3Verifier.target, registry.target);
    const geographicVerifier = await (
      await ethers.getContractFactory("EchoGeographicBoundVerifierV4")
    ).deploy();
    const policy = await (
      await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")
    ).deploy();
    const gateway = await (
      await ethers.getContractFactory("EchoGeographicProofGatewayV4")
    ).deploy(geographicVerifier.target, policy.target);
    const dual = await (
      await ethers.getContractFactory("EchoDualProofVerifierV4")
    ).deploy(v3Bridge.target, gateway.target);
    const bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV4")
    ).deploy(dual.target, registry.target);
    const account = await (
      await ethers.getContractFactory("EchoSmartAccountV4")
    ).deploy(owner.address, ethers.ZeroAddress, bridge.target);

    const data = registry.interface.encodeFunctionData(
      "setValidatorSigner",
      [validator.address, true]
    );

    await assert.rejects(async () => {
      const tx = await account.executeAdministration(registry.target, data);
      await tx.wait();
    });

    expect(
      await registry.trustedValidatorSigners(account.target, validator.address)
    ).to.equal(false);
  });
});

describe("ECHO V4 geographic zero-trust regression", function () {
  it("rejects proof-free geographic policy changes by the owner", async function () {
    const [owner] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const policy = await (
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

    const bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV4")
    ).deploy(dualVerifier.target, registry.target);

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountV4")
    ).deploy(owner.address, ethers.ZeroAddress, bridge.target);

    const zone = {
      minLat: 1200000000,
      maxLat: 1210000000,
      minLon: 2400000000,
      maxLon: 2410000000
    };

    const data = policy.interface.encodeFunctionData(
      "setGeographicPolicy", [owner.address, zone]
    );

    await assert.rejects(async () => {
      const tx = await account.executeGeographicAdministration(data);
      await tx.wait();
    });

    const saved = await policy.getGeographicPolicy(
      account.target, owner.address
    );

    expect(saved.enabled).to.equal(false);
  });
});

describe("ECHO V4 ownership zero-trust regression", function () {
  it("rejects proof-free ownership transfer initiation", async function () {
    const [owner, newOwner] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountV4")
    ).deploy(owner.address, ethers.ZeroAddress, registry.target);

    await assert.rejects(async () => {
      const tx = await account.connect(owner).transferOwnership(newOwner.address);
      await tx.wait();
    });

    expect(await account.owner()).to.equal(owner.address);
    expect(await account.pendingOwner()).to.equal(ethers.ZeroAddress);
  });
});
