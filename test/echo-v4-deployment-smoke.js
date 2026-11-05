const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Echo Protocol Z V4 deployment smoke test", function () {
  it("deploys all nine real contracts in dependency order", async function () {
    const [owner] = await ethers.getSigners();

    async function deploy(name, args = []) {
      const factory = await ethers.getContractFactory(name);
      const contract = await factory.deploy(...args);
      await contract.waitForDeployment();

      const address = await contract.getAddress();
      expect(await ethers.provider.getCode(address)).to.not.equal("0x");

      return { contract, address };
    }

    const registry = await deploy("EchoAttestationRegistryV3");
    const verifierV3 = await deploy("EchoAuthorizationVerifierV3");

    const bridgeV3 = await deploy("EchoAuthorizationBridgeV3", [
      verifierV3.address,
      registry.address
    ]);

    const policy = await deploy("EchoGeographicPolicyRegistryV4");
    const verifierV4 = await deploy("EchoGeographicBoundVerifierV4");

    const gateway = await deploy("EchoGeographicProofGatewayV4", [
      verifierV4.address,
      policy.address
    ]);

    const dual = await deploy("EchoDualProofVerifierV4", [
      bridgeV3.address,
      gateway.address
    ]);

    const bridgeV4 = await deploy("EchoAuthorizationBridgeV4", [
      dual.address,
      registry.address
    ]);

    const account = await deploy("EchoSmartAccountV4", [
      owner.address,
      ethers.ZeroAddress,
      bridgeV4.address
    ]);

    expect(await account.contract.owner()).to.equal(owner.address);

    console.log("PASS: All nine Echo V4 deployment contracts");
  });
});
