"use strict";
// Regression using genuine existing proof artifacts (NOT a successful delegation proof).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");

describe("Echo V4 delegation: verified fresh proof cannot cross account boundary", function () {
  it("rejects old Amoy proofs on a fresh candidate without consuming authorization", async function () {
    const dir = "build/v4-geographic-bound/proofs";
    const prefix = "fresh-1794741142-nonce-1";
    const names = [
      prefix + "-signed-checkpoint.json",
      prefix + "-v3-proof.json",
      prefix + "-v3-public.json",
      prefix + "-v4-proof.json",
      prefix + "-v4-public.json"
    ];
    if (names.some(name => !fs.existsSync(path.join(dir, name)))) {
      throw new Error("Missing genuine proof artifacts; run the existing proof-generation workflow first");
    }
    const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    const signed = read(names[0]);
    const [v3A, v3B, v3C, v3Signals] = JSON.parse(`[${await snarkjs.groth16.exportSolidityCallData(read(names[1]), read(names[2]))}]`);
    const [v4A, v4B, v4C, v4Signals] = JSON.parse(`[${await snarkjs.groth16.exportSolidityCallData(read(names[3]), read(names[4]))}]`);
    assert.equal(v3Signals.length, 20);
    assert.equal(v4Signals.length, 5);

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
    assert.notEqual(signed.checkpoint.account.toLowerCase(), account.target.toLowerCase());
    assert.notEqual(signed.checkpoint.delegatee.toLowerCase(), signed.checkpoint.account.toLowerCase());
    const proof = { v3A, v3B, v3C, v3Signals, v4A, v4B, v4C, v4Signals };
    const nonceBefore = await account.nonce();
    await assert.rejects(async () => {
      const tx = await account.authorizeDelegateeWithProof(
        signed.checkpoint, signed.signature, proof, delegatee.address, true);
      await tx.wait();
    }, err => {
      const data = err.data || err.info?.error?.data;
      if (data) assert.equal(String(data).slice(0, 10).toLowerCase(),
        account.interface.getError("InvalidDelegationIntent").selector.toLowerCase());
      return true;
    });
    assert.equal(await account.nonce(), nonceBefore);
    assert.equal(await bridge.authorizedDelegatees(account.target, delegatee.address), false);
    assert.equal(await bridge.consumedNullifiers(v3Signals[2]), false);
  });
});
