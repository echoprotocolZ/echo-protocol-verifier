const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ECHO V4 atomic bootstrap security", function () {
  const zone = { minLat: 100000, maxLat: 101000, minLon: 199000, maxLon: 201000 };
  async function dependencies() {
    const [owner, validator, outsider] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const v3Verifier = await (await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
    const v3Bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV3")).deploy(v3Verifier.target, registry.target);
    const geographicPolicy = await (await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")).deploy();
    const geographicVerifier = await (await ethers.getContractFactory("EchoGeographicBoundVerifierV4")).deploy();
    const gateway = await (await ethers.getContractFactory("EchoGeographicProofGatewayV4")).deploy(geographicVerifier.target, geographicPolicy.target);
    const dual = await (await ethers.getContractFactory("EchoDualProofVerifierV4")).deploy(v3Bridge.target, gateway.target);
    const bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(dual.target, registry.target);
    return { owner, validator, outsider, registry, geographicPolicy, bridge };
  }
  it("atomically configures account-scoped permissions and preserves admin denial", async function () {
    const { owner, validator, outsider, registry, geographicPolicy, bridge } = await dependencies();
    const account = await (await ethers.getContractFactory("EchoBootstrappedSmartAccountV4")).deploy(
      owner.address, ethers.ZeroAddress, bridge.target, owner.address, validator.address, zone, 3600
    );
    const zoneHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint32", "uint32", "uint32", "uint32"],
      [ethers.id("ECHO_V4_GEOGRAPHIC_ZONE_V1"), zone.minLat, zone.maxLat, zone.minLon, zone.maxLon]
    ));
    expect(await account.owner()).to.equal(owner.address);
    expect(await registry.authorizedCheckpointBridges(account.target, bridge.target)).to.equal(true);
    expect(await registry.trustedValidatorSigners(account.target, validator.address)).to.equal(true);
    expect(await bridge.authorizedDelegatees(account.target, owner.address)).to.equal(true);
    const attestation = await registry.attestationPolicies(account.target, owner.address);
    expect(attestation.allowedZoneHash).to.equal(zoneHash);
    expect(attestation.enabled).to.equal(true);
    const geo = await geographicPolicy.getGeographicPolicy(account.target, owner.address);
    expect(geo.zoneHash).to.equal(zoneHash);
    expect(geo.enabled).to.equal(true);
    expect(await registry.trustedValidatorSigners(outsider.address, validator.address)).to.equal(false);
    await expect(account.executeAdministration(registry.target, "0x"))
      .to.be.revertedWithCustomError(account, "Unauthorized");
    await expect(account.executeGeographicAdministration("0x"))
      .to.be.revertedWithCustomError(account, "Unauthorized");
    await expect(account.connect(outsider).transferOwnership(outsider.address))
      .to.be.revertedWithCustomError(account, "Unauthorized");
  });
  it("rejects invalid bootstrap input atomically", async function () {
    const { owner, validator, bridge } = await dependencies();
    const factory = await ethers.getContractFactory("EchoBootstrappedSmartAccountV4");
    await expect(factory.deploy(owner.address, ethers.ZeroAddress, bridge.target,
      ethers.ZeroAddress, validator.address, zone, 3600))
      .to.be.revertedWithCustomError(factory, "InvalidBootstrapConfiguration");
    await expect(factory.deploy(owner.address, ethers.ZeroAddress, bridge.target,
      owner.address, ethers.ZeroAddress, zone, 3600))
      .to.be.revertedWithCustomError(factory, "InvalidBootstrapConfiguration");
    await expect(factory.deploy(owner.address, ethers.ZeroAddress, bridge.target,
      owner.address, validator.address, zone, 0))
      .to.be.revertedWithCustomError(factory, "InvalidBootstrapConfiguration");
    await expect(factory.deploy(owner.address, ethers.ZeroAddress, bridge.target,
      owner.address, validator.address, { ...zone, minLat: zone.maxLat + 1 }, 3600))
      .to.be.reverted;
  });
});
