"use strict";
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("Echo V4 delegation candidate: intent isolation", function () {
  it("binds each permission intent to account, chain, delegatee, decision and nonce", async function () {
    const [owner, delegateeA, delegateeB] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const verifier = await (await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
    const v3Bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV3")).deploy(verifier.target, registry.target);
    const geoVerifier = await (await ethers.getContractFactory("EchoGeographicBoundVerifierV4")).deploy();
    const geoPolicy = await (await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")).deploy();
    const gateway = await (await ethers.getContractFactory("EchoGeographicProofGatewayV4")).deploy(geoVerifier.target, geoPolicy.target);
    const dual = await (await ethers.getContractFactory("EchoDualProofVerifierV4")).deploy(v3Bridge.target, gateway.target);
    const bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(dual.target, registry.target);
    const factory = await ethers.getContractFactory("EchoSmartAccountV4DelegationCandidate");
    const zone = { minLat: 0, maxLat: 1800000000, minLon: 0, maxLon: 3600000000 };
    const first = await factory.deploy(owner.address, ethers.ZeroAddress, bridge.target, owner.address, zone, 3600);
    const second = await factory.deploy(owner.address, ethers.ZeroAddress, bridge.target, owner.address, zone, 3600);

    const approval = await first.delegationIntent(delegateeA.address, true);
    assert.notEqual(approval, await second.delegationIntent(delegateeA.address, true), "cross-account intent collision");
    assert.notEqual(approval, await first.delegationIntent(delegateeB.address, true), "cross-delegatee intent collision");
    assert.notEqual(approval, await first.delegationIntent(delegateeA.address, false), "approval/revocation intent collision");

    const types = ["bytes32", "uint256", "address", "address", "bool", "uint256"];
    const fields = ethers.AbiCoder.defaultAbiCoder().decode(types, approval);
    assert.equal(fields[0], await first.DELEGATION_DOMAIN());
    assert.equal(fields[1], (await ethers.provider.getNetwork()).chainId);
    assert.equal(fields[2].toLowerCase(), first.target.toLowerCase());
    assert.equal(fields[3].toLowerCase(), delegateeA.address.toLowerCase());
    assert.equal(fields[4], true);
    assert.equal(fields[5], 0n);

    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(types, [
      fields[0], fields[1] + 1n, fields[2], fields[3], fields[4], fields[5]
    ]);
    assert.notEqual(ethers.keccak256(approval), ethers.keccak256(encoded), "cross-chain intent collision");
    const nextNonce = ethers.AbiCoder.defaultAbiCoder().encode(types, [
      fields[0], fields[1], fields[2], fields[3], fields[4], fields[5] + 1n
    ]);
    assert.notEqual(ethers.keccak256(approval), ethers.keccak256(nextNonce), "cross-nonce intent collision");

    assert.equal(await first.nonce(), 0n);
    assert.equal(await second.nonce(), 0n);
    assert.equal(await bridge.authorizedDelegatees(first.target, delegateeA.address), false);
    assert.equal(await bridge.authorizedDelegatees(second.target, delegateeA.address), false);
  });
});
