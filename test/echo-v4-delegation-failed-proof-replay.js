"use strict";
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("Echo V4 delegation candidate: failed-proof replay invariants", function () {
  it("repeated invalid authorization cannot consume nonce or change permissions", async function () {
    const [owner, delegatee] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const verifier = await (await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
    const v3Bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV3")).deploy(verifier.target, registry.target);
    const geoVerifier = await (await ethers.getContractFactory("EchoGeographicBoundVerifierV4")).deploy();
    const geoPolicy = await (await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")).deploy();
    const gateway = await (await ethers.getContractFactory("EchoGeographicProofGatewayV4")).deploy(geoVerifier.target, geoPolicy.target);
    const dual = await (await ethers.getContractFactory("EchoDualProofVerifierV4")).deploy(v3Bridge.target, gateway.target);
    const bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(dual.target, registry.target);
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4DelegationCandidate")).deploy(
      owner.address, ethers.ZeroAddress, bridge.target, owner.address,
      { minLat: 0, maxLat: 1800000000, minLon: 0, maxLon: 3600000000 }, 3600
    );
    const checkpoint = {
      account: account.target, delegatee: account.target,
      zoneHash: ethers.ZeroHash, checkpointCommitment: ethers.ZeroHash,
      authorizationCommitment: ethers.ZeroHash, timestamp: 0, nonce: 0
    };
    const zero2 = [0, 0];
    const proof = {
      v3A: zero2, v3B: [[0, 0], [0, 0]], v3C: zero2,
      v3Signals: Array(20).fill(0), v4A: zero2,
      v4B: [[0, 0], [0, 0]], v4C: zero2, v4Signals: Array(5).fill(0)
    };
    const initialIntent = await account.delegationIntent(delegatee.address, true);
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(async () => {
        const tx = await account.authorizeDelegateeWithProof(checkpoint, "0x", proof, delegatee.address, true);
        await tx.wait();
      });
      assert.equal(await account.nonce(), 0n);
      assert.equal(await bridge.authorizedDelegatees(account.target, delegatee.address), false);
      assert.equal(await account.delegationIntent(delegatee.address, true), initialIntent);
    }
  });
});
