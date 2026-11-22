const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

describe("ECHO V4 bridge unauthorized-caller atomic preflight (local)", function () {
  it("rejects repeated direct authorize calls before checkpoint/nullifier consumption", async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    const [outsider, accountSigner] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const verifier = await (await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
    const v3Bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV3")).deploy(verifier.target, registry.target);
    const geographicVerifier = await (await ethers.getContractFactory("EchoGeographicBoundVerifierV4")).deploy();
    const policy = await (await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")).deploy();
    const gateway = await (await ethers.getContractFactory("EchoGeographicProofGatewayV4")).deploy(geographicVerifier.target, policy.target);
    const dual = await (await ethers.getContractFactory("EchoDualProofVerifierV4")).deploy(v3Bridge.target, gateway.target);
    const bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(dual.target, registry.target);
    const nullifier = 987654321n;
    const checkpoint = {
      account: accountSigner.address,
      delegatee: accountSigner.address,
      zoneHash: ethers.ZeroHash,
      checkpointCommitment: ethers.ZeroHash,
      authorizationCommitment: ethers.ZeroHash,
      timestamp: 0,
      nonce: 0
    };
    const zeros2 = [0, 0], zeros2x2 = [[0, 0], [0, 0]];
    const v3Signals = Array(20).fill(0);
    v3Signals[2] = nullifier;
    const v4Signals = Array(5).fill(0);
    for (let i = 0; i < 2; i++) {
      await assert.rejects(async () => {
        const tx = await bridge.connect(outsider).authorize(
          checkpoint, "0x", zeros2, zeros2x2, zeros2, v3Signals,
          zeros2, zeros2x2, zeros2, v4Signals,
          outsider.address, 0, "0x", 0
        );
        await tx.wait();
      }, "direct outsider authorization must revert");
      assert.equal(await bridge.consumedNullifiers(nullifier), false,
        "rejected outsider call consumed nullifier");
      assert.equal(await bridge.authorizedDelegatees(accountSigner.address, outsider.address), false,
        "rejected outsider call granted delegation");
    }
  });
});
