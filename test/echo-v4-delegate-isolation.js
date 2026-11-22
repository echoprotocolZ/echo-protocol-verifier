const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ECHO V4 delegate isolation", function () {
  it("prevents outsiders from authorizing themselves for a smart account", async function () {
    const [owner, attacker] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const verifier = await (
      await ethers.getContractFactory("EchoAuthorizationVerifierV3")
    ).deploy();

    const v3Bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV3")
    ).deploy(verifier.target, registry.target);

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

    await bridge.connect(attacker).setAuthorizedDelegatee(
      attacker.address,
      true
    );

    expect(
      await bridge.authorizedDelegatees(account.target, attacker.address)
    ).to.equal(false);

    expect(
      await bridge.authorizedDelegatees(attacker.address, attacker.address)
    ).to.equal(true);
  });
});
