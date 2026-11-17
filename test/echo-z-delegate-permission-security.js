const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ECHO Z delegate permission security", function () {
  it("prevents outsiders from modifying account delegate permissions", async function () {
    const [owner, factory, attacker] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const v3Verifier = await (
      await ethers.getContractFactory("EchoAuthorizationVerifierV3")
    ).deploy();

    const v3Bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV3")
    ).deploy(v3Verifier.target, registry.target);

    const geoVerifier = await (
      await ethers.getContractFactory("EchoGeographicBoundVerifierV4")
    ).deploy();

    const policy = await (
      await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")
    ).deploy();

    const gateway = await (
      await ethers.getContractFactory("EchoGeographicProofGatewayV4")
    ).deploy(geoVerifier.target, policy.target);

    const dual = await (
      await ethers.getContractFactory("EchoDualProofVerifierV4")
    ).deploy(v3Bridge.target, gateway.target);

    const bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV4")
    ).deploy(dual.target, registry.target);

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountZ")
    ).deploy(
      owner.address,
      ethers.ZeroAddress,
      bridge.target,
      factory.address
    );

    await (
      await bridge.connect(attacker)
        .setAuthorizedDelegatee(attacker.address, true)
    ).wait();

    expect(
      await bridge.authorizedDelegatees(
        account.target,
        attacker.address
      )
    ).to.equal(false);

    expect(await account.initialized()).to.equal(false);
  });
});
