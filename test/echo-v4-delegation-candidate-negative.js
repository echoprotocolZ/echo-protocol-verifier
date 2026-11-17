"use strict";
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("Echo V4 proof-bound delegation candidate: negative integration", function () {
  let owner, outsider, delegatee, bridge, account;
  const zero2 = [0, 0];
  const zeroB = [[0, 0], [0, 0]];
  const emptyProof = () => ({
    v3A: zero2, v3B: zeroB, v3C: zero2, v3Signals: Array(20).fill(0),
    v4A: zero2, v4B: zeroB, v4C: zero2, v4Signals: Array(5).fill(0)
  });
  const checkpoint = (accountAddress, delegateeAddress) => ({
    account: accountAddress, delegatee: delegateeAddress,
    zoneHash: ethers.ZeroHash, checkpointCommitment: ethers.ZeroHash,
    authorizationCommitment: ethers.ZeroHash, timestamp: 0, nonce: 0
  });
  async function assertNoPermission() {
    assert.equal(await bridge.authorizedDelegatees(account.target, delegatee.address), false);
    assert.equal(await account.nonce(), 0n);
  }
  async function assertCustomError(promise, contract, name) {
    await assert.rejects(promise, (err) => {
      const data = err.data || err.info?.error?.data;
      assert.equal(String(data).slice(0, 10).toLowerCase(), contract.interface.getError(name).selector.toLowerCase());
      return true;
    });
  }

  beforeEach(async function () {
    [owner, outsider, delegatee] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const v3Verifier = await (await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
    const v3Bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV3")).deploy(v3Verifier.target, registry.target);
    const geoVerifier = await (await ethers.getContractFactory("EchoGeographicBoundVerifierV4")).deploy();
    const geoPolicy = await (await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")).deploy();
    const gateway = await (await ethers.getContractFactory("EchoGeographicProofGatewayV4")).deploy(geoVerifier.target, geoPolicy.target);
    const dual = await (await ethers.getContractFactory("EchoDualProofVerifierV4")).deploy(v3Bridge.target, gateway.target);
    bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(dual.target, registry.target);
    account = await (await ethers.getContractFactory("EchoSmartAccountV4DelegationCandidate")).deploy(
      owner.address, ethers.ZeroAddress, bridge.target, owner.address,
      { minLat: 0, maxLat: 1800000000, minLon: 0, maxLon: 3600000000 }, 3600
    );
  });

  it("rejects outsider even when checkpoint claims self-delegation", async function () {
    await assertCustomError(
      () => account.connect(outsider).authorizeDelegateeWithProof.staticCall(
        checkpoint(account.target, account.target), "0x", emptyProof(), delegatee.address, true),
      account, "InvalidDelegationIntent");
    await assertNoPermission();
  });

  it("rejects owner attempt using an external-delegatee checkpoint", async function () {
    await assertCustomError(
      () => account.connect(owner).authorizeDelegateeWithProof.staticCall(
        checkpoint(account.target, delegatee.address), "0x", emptyProof(), delegatee.address, true),
      account, "InvalidDelegationIntent");
    await assertNoPermission();
  });

  it("rejects zero address and self-delegation permission updates", async function () {
    for (const bad of [ethers.ZeroAddress, account.target]) {
      await assertCustomError(
        () => account.connect(owner).authorizeDelegateeWithProof.staticCall(
          checkpoint(account.target, account.target), "0x", emptyProof(), bad, true),
        account, "InvalidDelegationIntent");
    }
    await assertNoPermission();
  });

  it("does not grant permissions with missing signature and zero proofs", async function () {
    await assert.rejects(() => account.connect(owner).authorizeDelegateeWithProof.staticCall(
      checkpoint(account.target, account.target), "0x", emptyProof(), delegatee.address, true));
    await assertNoPermission();
  });

  it("encodes chain, account, delegatee, decision, and nonce into intent", async function () {
    const bytes = await account.delegationIntent(delegatee.address, true);
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
      ["bytes32", "uint256", "address", "address", "bool", "uint256"], bytes);
    assert.equal(decoded[0], await account.DELEGATION_DOMAIN());
    assert.equal(decoded[1], (await ethers.provider.getNetwork()).chainId);
    assert.equal(decoded[2].toLowerCase(), account.target.toLowerCase());
    assert.equal(decoded[3].toLowerCase(), delegatee.address.toLowerCase());
    assert.equal(decoded[4], true);
    assert.equal(decoded[5], 0n);
    assert.notEqual(await account.delegationIntent(delegatee.address, false), bytes);
    await assertNoPermission();
  });
});
