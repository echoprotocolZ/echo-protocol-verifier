const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO V4 bridge caller isolation", function () {
  it("rejects direct authorization from an outsider", async function () {
    const [owner, attacker] = await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const v3 = await (
      await ethers.getContractFactory("EchoAuthorizationVerifierV3")
    ).deploy();

    const v3Bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV3")
    ).deploy(v3.target, registry.target);

    const geo = await (
      await ethers.getContractFactory("EchoGeographicBoundVerifierV4")
    ).deploy();

    const policy = await (
      await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")
    ).deploy();

    const gateway = await (
      await ethers.getContractFactory("EchoGeographicProofGatewayV4")
    ).deploy(geo.target, policy.target);

    const dual = await (
      await ethers.getContractFactory("EchoDualProofVerifierV4")
    ).deploy(v3Bridge.target, gateway.target);

    const bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV4")
    ).deploy(dual.target, registry.target);

    const checkpoint = {
      account: owner.address,
      delegatee: attacker.address,
      zoneHash: ethers.ZeroHash,
      checkpointCommitment: ethers.ZeroHash,
      authorizationCommitment: ethers.ZeroHash,
      timestamp: 0,
      nonce: 0
    };

    const a = [0, 0];
    const b = [[0, 0], [0, 0]];
    const signals3 = Array(20).fill(0);
    const signals4 = Array(5).fill(0);

    await assert.rejects(
      async () => {
        const tx = await bridge.connect(attacker).authorize(
          checkpoint, "0x",
          a, b, a, signals3,
          a, b, a, signals4,
          attacker.address, 0, "0x", 0
        );
        await tx.wait();
      },
      /UnauthorizedAccount/
    );
  });
});
