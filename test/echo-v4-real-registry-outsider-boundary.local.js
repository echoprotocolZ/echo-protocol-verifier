const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

describe("ECHO V4 bridge + real V3 registry caller boundary (local)", function () {
  it("rejects direct outsider authorization without consuming V3 checkpoint or V4 nullifier", async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    const [account, outsider, validator] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const v3Verifier = await (await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
    const v3Bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV3"))
      .deploy(await v3Verifier.getAddress(), await registry.getAddress());
    const geoVerifier = await (await ethers.getContractFactory("EchoGeographicBoundVerifierV4")).deploy();
    const policy = await (await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")).deploy();
    const gateway = await (await ethers.getContractFactory("EchoGeographicProofGatewayV4"))
      .deploy(await geoVerifier.getAddress(), await policy.getAddress());
    const dual = await (await ethers.getContractFactory("EchoDualProofVerifierV4"))
      .deploy(await v3Bridge.getAddress(), await gateway.getAddress());
    const bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV4"))
      .deploy(await dual.getAddress(), await registry.getAddress());
    await bridge.waitForDeployment();
    const block = await ethers.provider.getBlock("latest");
    const zoneHash = ethers.keccak256(ethers.toUtf8Bytes("bridge-registry-boundary"));
    const checkpoint = {
      account: account.address, delegatee: account.address, zoneHash,
      checkpointCommitment: ethers.keccak256(ethers.toUtf8Bytes("checkpoint")),
      authorizationCommitment: ethers.keccak256(ethers.toUtf8Bytes("authorization")),
      timestamp: block.timestamp, nonce: 17
    };
    const digest = await registry.checkpointDigest(checkpoint);
    const nullifier = 13371337n;
    const s3 = Array(20).fill(0);
    s3[2] = nullifier;
    const a = [0, 0], b = [[0, 0], [0, 0]], s4 = Array(5).fill(0);
    for (let i = 0; i < 2; i++) {
      await assert.rejects(async () => {
        const tx = await bridge.connect(outsider).authorize(
          checkpoint, "0x", a, b, a, s3, a, b, a, s4,
          outsider.address, 0, "0x", 17
        );
        await tx.wait();
      });
      assert.equal(await registry.consumedCheckpoints(digest), false);
      assert.equal(await registry.consumedCheckpointNonces(account.address, account.address, 17), false);
      assert.equal(await bridge.consumedNullifiers(nullifier), false);
      assert.equal(await bridge.authorizedDelegatees(account.address, outsider.address), false);
    }
  });
});
