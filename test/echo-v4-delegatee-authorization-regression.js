"use strict";
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("Echo V4 delegatee authorization regression", function () {
  it("rejects external delegatee before processing any proofs", async function () {
    const [account, delegatee] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const verifier = await (await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
    const v3Bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV3")).deploy(verifier.target, registry.target);
    const geoVerifier = await (await ethers.getContractFactory("EchoGeographicBoundVerifierV4")).deploy();
    const policy = await (await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")).deploy();
    const gateway = await (await ethers.getContractFactory("EchoGeographicProofGatewayV4")).deploy(geoVerifier.target, policy.target);
    const dual = await (await ethers.getContractFactory("EchoDualProofVerifierV4")).deploy(v3Bridge.target, gateway.target);
    const bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(dual.target, registry.target);
    const checkpoint = {
      account: account.address, delegatee: delegatee.address,
      zoneHash: ethers.ZeroHash, checkpointCommitment: ethers.ZeroHash,
      authorizationCommitment: ethers.ZeroHash, timestamp: 0, nonce: 0
    };
    const zeros2 = [0, 0], zerosB = [[0, 0], [0, 0]];
    const args = [checkpoint, "0x", zeros2, zerosB, zeros2, Array(20).fill(0),
      zeros2, zerosB, zeros2, Array(5).fill(0), delegatee.address, 0, "0x", 0];
    assert.equal(await bridge.authorizedDelegatees(account.address, delegatee.address), false);
    await assert.rejects(() => bridge.connect(account).authorize.staticCall(...args), (error) => {
      const data = error.data || error.info?.error?.data;
      assert.equal(String(data).slice(0, 10).toLowerCase(), bridge.interface.getError("UnauthorizedDelegatee").selector.toLowerCase());
      return true;
    });
    // An unrelated EOA cannot grant permissions for this account.
    await bridge.connect(delegatee).setAuthorizedDelegatee(delegatee.address, true);
    assert.equal(await bridge.authorizedDelegatees(account.address, delegatee.address), false);
    await assert.rejects(() => bridge.connect(account).authorize.staticCall(...args), (error) => {
      const data = error.data || error.info?.error?.data;
      assert.equal(String(data).slice(0, 10).toLowerCase(), bridge.interface.getError("UnauthorizedDelegatee").selector.toLowerCase());
      return true;
    });
    // The account itself may opt in. This test uses an EOA as the account
    // only to exercise bridge permission semantics, NOT a smart-account admin path.
    await bridge.connect(account).setAuthorizedDelegatee(delegatee.address, true);
    assert.equal(await bridge.authorizedDelegatees(account.address, delegatee.address), true);
    await assert.rejects(() => bridge.connect(account).authorize.staticCall(...args), (error) => {
      const data = error.data || error.info?.error?.data;
      assert.notEqual(String(data).slice(0, 10).toLowerCase(), bridge.interface.getError("UnauthorizedDelegatee").selector.toLowerCase());
      return true;
    });
  });
});
