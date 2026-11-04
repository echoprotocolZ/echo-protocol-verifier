const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");

describe("ECHO V4 execution lock security", function () {
  it("protects all three execution pathways with one lock", async function () {
    const source = fs.readFileSync(
      "contracts/EchoSmartAccountV4.sol",
      "utf8"
    );

    expect(source).to.include("modifier nonReentrantExecution()");

    for (const functionName of [
      "executeAuthorized",
      "executeAdministration",
      "executeGeographicAdministration"
    ]) {
      const start = source.indexOf(`function ${functionName}(`);
      expect(start, `${functionName} must exist`).to.be.greaterThan(-1);

      const declaration = source.slice(
        start,
        source.indexOf("{", start)
      );

      expect(
        declaration,
        `${functionName} must use the execution lock`
      ).to.include("nonReentrantExecution");
    }
  });

  it("rejects unauthorized administrative access", async function () {
    const [owner, outsider] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const verifier = await (
      await ethers.getContractFactory("EchoGeographicBoundVerifierV4")
    ).deploy();

    const policy = await (
      await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")
    ).deploy();

    const gateway = await (
      await ethers.getContractFactory("EchoGeographicProofGatewayV4")
    ).deploy(verifier.target, policy.target);

    const v3Verifier = await (
      await ethers.getContractFactory("EchoAuthorizationVerifierV3")
    ).deploy();

    const v3Bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV3")
    ).deploy(v3Verifier.target, registry.target);

    const dual = await (
      await ethers.getContractFactory("EchoDualProofVerifierV4")
    ).deploy(v3Bridge.target, gateway.target);

    const bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV4")
    ).deploy(dual.target, registry.target);

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountV4")
    ).deploy(owner.address, ethers.ZeroAddress, bridge.target);

    const adminData = registry.interface.encodeFunctionData(
      "setValidatorSigner",
      [outsider.address, true]
    );

    let rejected = false;

    try {
      await (
        await account.connect(outsider).executeAdministration(
          registry.target,
          adminData
        )
      ).wait();
    } catch (error) {
      rejected = true;
    }

    expect(rejected).to.equal(true);

    expect(
      await registry.trustedValidatorSigners(
        account.target,
        outsider.address
      )
    ).to.equal(false);
  });
});
