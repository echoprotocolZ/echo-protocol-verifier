"use strict";
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const { proveAuthorizedCall } = require("./helpers/echo-real-dual-proof");

describe("Echo V4: geographic administration downstream atomic rollback", function () {
  this.timeout(240000);
  async function deploy(name, ...args) {
    const c = await (await ethers.getContractFactory(name)).deploy(...args);
    await c.waitForDeployment();
    return c;
  }
  it("rolls back proof consumption, nonce and geo policy when attestation update fails", async function () {
    const [owner, validator, delegatee] = await ethers.getSigners();
    const implementation = await deploy("EchoAttestationRegistryV3");
    const proxy = await deploy("EchoAttestationPolicyFaultProxy", implementation.target, delegatee.address);
    const registry = await ethers.getContractAt("EchoAttestationRegistryV3", proxy.target);
    const v3 = await deploy("EchoAuthorizationVerifierV3");
    const v3bridge = await deploy("EchoAuthorizationBridgeV3", v3.target, proxy.target);
    const policy = await deploy("EchoGeographicPolicyRegistryV4");
    const v4 = await deploy("EchoGeographicBoundVerifierV4");
    const gateway = await deploy("EchoGeographicProofGatewayV4", v4.target, policy.target);
    const dual = await deploy("EchoDualProofVerifierV4", v3bridge.target, gateway.target);
    const bridge = await deploy("EchoAuthorizationBridgeV4", dual.target, proxy.target);
    const zone = { minLat:100050, maxLat:100050, minLon:200000, maxLon:200000 };
    const account = await deploy("EchoSmartAccountV4DelegationCandidate",
      owner.address, ethers.ZeroAddress, bridge.target, validator.address, zone, 3600n);
    const intent = await account.geographicPolicyIntent(delegatee.address, zone, true);
    const p = await proveAuthorizedCall({
      account: account.target, delegatee: account.target, validator,
      registry: proxy.target, target: account.target, data: intent,
      value: 0n, nonce: 0n, zone
    });
    const bundle = {
      v3A:p.v3A, v3B:p.v3B, v3C:p.v3C, v3Signals:p.v3Signals,
      v4A:p.v4A, v4B:p.v4B, v4C:p.v4C, v4Signals:p.v4Signals
    };
    const digest = await registry.checkpointDigest(p.checkpoint);
    const before = await policy.getGeographicPolicy(account.target, delegatee.address);
    assert.equal(before.enabled, false);
    assert.equal(await account.nonce(), 0n);
    assert.equal(await registry.consumedCheckpoints(digest), false);
    assert.equal(await bridge.consumedNullifiers(p.nullifier), false);
    const selector = ethers.id("InjectedAttestationPolicyFailure()").slice(0, 10);
    await assert.rejects(async () => {
      const tx = await account.connect(owner).authorizeGeographicPolicyWithProof(
        p.checkpoint, p.signature, bundle, delegatee.address, zone, true
      );
      await tx.wait();
    }, (error) => {
      assert.match([String(error), error?.data, error?.error?.data, error?.info?.error?.data, error?.shortMessage].filter(Boolean).join(" | "), new RegExp(selector, "i"),
        "must reach injected downstream failure; actual revert: " + String(error) + " | data=" + String(error?.data) + " | nested=" + String(error?.info?.error?.data));
      return true;
    });
    assert.equal(await account.nonce(), 0n, "nonce rolled back");
    assert.equal(await bridge.consumedNullifiers(p.nullifier), false, "nullifier rolled back");
    assert.equal(await registry.consumedCheckpoints(digest), false, "checkpoint rolled back");
    assert.equal(await registry.consumedCheckpointNonces(account.target, account.target, 0n), false,
      "checkpoint nonce rolled back");
    const after = await policy.getGeographicPolicy(account.target, delegatee.address);
    assert.equal(after.enabled, false, "geographic policy rolled back");
    assert.equal(after.zoneHash, before.zoneHash, "geographic zone rolled back");
    assert.equal((await registry.attestationPolicies(account.target, delegatee.address)).enabled,
      false, "attestation policy unchanged");
    // Retry must reach the injected downstream fault, not an accidentally stuck lock.
    await assert.rejects(async () => {
      const tx = await account.connect(owner).authorizeGeographicPolicyWithProof(
        p.checkpoint, p.signature, bundle, delegatee.address, zone, true
      );
      await tx.wait();
    }, (error) => {
      assert.match([String(error), error?.data, error?.error?.data, error?.info?.error?.data].filter(Boolean).join(" | "), /InjectedAttestationPolicyFailure|0xdcee7a32/i);
      return true;
    });
  });
});
