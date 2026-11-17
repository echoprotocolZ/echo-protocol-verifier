const { expect } = require("chai");
const { ethers } = require("hardhat");
const assert = require("node:assert/strict");

describe("ECHO V4 proof path cannot bootstrap administration", function () {
  it("rejects self-target ownership transfer before calling the proof bridge", async function () {
    const [owner, successor] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const v3Verifier = await (await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
    const v3Bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV3")).deploy(v3Verifier.target, registry.target);
    const geographicVerifier = await (await ethers.getContractFactory("EchoGeographicBoundVerifierV4")).deploy();
    const policy = await (await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")).deploy();
    const gateway = await (await ethers.getContractFactory("EchoGeographicProofGatewayV4")).deploy(geographicVerifier.target, policy.target);
    const dual = await (await ethers.getContractFactory("EchoDualProofVerifierV4")).deploy(v3Bridge.target, gateway.target);
    const bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(dual.target, registry.target);
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4")).deploy(owner.address, ethers.ZeroAddress, bridge.target);

    const checkpoint = {
      account: account.target, delegatee: owner.address,
      zoneHash: ethers.ZeroHash, checkpointCommitment: ethers.ZeroHash,
      authorizationCommitment: ethers.ZeroHash, timestamp: 0n, nonce: 0n
    };
    const zero2 = [0n, 0n];
    const zeroB = [[0n, 0n], [0n, 0n]];
    const v3Signals = Array(20).fill(0n);
    const v4Signals = Array(5).fill(0n);
    const data = account.interface.encodeFunctionData("transferOwnership", [successor.address]);
    await assert.rejects(
      account.connect(owner).executeAuthorized(
        checkpoint, "0x", zero2, zeroB, zero2, v3Signals,
        zero2, zeroB, zero2, v4Signals, account.target, 0n, data
      ),
      /InvalidAddress/
    );
    expect(await account.owner()).to.equal(owner.address);
    expect(await account.pendingOwner()).to.equal(ethers.ZeroAddress);
    expect(await account.nonce()).to.equal(0n);
  });
});
