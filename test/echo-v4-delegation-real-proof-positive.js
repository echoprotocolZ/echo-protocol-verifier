"use strict";
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const { proveAuthorizedCall } = require("./helpers/echo-real-dual-proof");

describe("Echo V4 candidate: genuine proof-authorized delegatee administration", function () {
  this.timeout(240000);
  async function deploy(name, ...args) {
    const c = await (await ethers.getContractFactory(name)).deploy(...args);
    await c.waitForDeployment();
    return c;
  }
  it("grants, rejects replay, revokes, and rejects revoked-proof replay", async function () {
    const [owner, validator, delegatee, outsider] = await ethers.getSigners();
    const registry = await deploy("EchoAttestationRegistryV3");
    const v3Verifier = await deploy("EchoAuthorizationVerifierV3");
    const v3Bridge = await deploy("EchoAuthorizationBridgeV3", v3Verifier.target, registry.target);
    const policy = await deploy("EchoGeographicPolicyRegistryV4");
    const v4Verifier = await deploy("EchoGeographicBoundVerifierV4");
    const gateway = await deploy("EchoGeographicProofGatewayV4", v4Verifier.target, policy.target);
    const dual = await deploy("EchoDualProofVerifierV4", v3Bridge.target, gateway.target);
    const bridge = await deploy("EchoAuthorizationBridgeV4", dual.target, registry.target);
    // These coordinates match the real-proof helper's fixture witness.
    const zone = { minLat:100050, maxLat:100050, minLon:200000, maxLon:200000 };
    const account = await deploy("EchoSmartAccountV4DelegationCandidate",
      owner.address, ethers.ZeroAddress, bridge.target, validator.address, zone, 3600n);
    assert.equal(await registry.trustedValidatorSigners(account.target,validator.address),true);
    assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),false);
    async function authorize(authorized) {
      const nonce = await account.nonce();
      const data = await account.delegationIntent(delegatee.address,authorized);
      const p = await proveAuthorizedCall({
        account:account.target, delegatee:account.target, validator,
        registry:registry.target, target:account.target, data, value:0n, nonce, zone
      });
      const bundle = {
        v3A:p.v3A,v3B:p.v3B,v3C:p.v3C,v3Signals:p.v3Signals,
        v4A:p.v4A,v4B:p.v4B,v4C:p.v4C,v4Signals:p.v4Signals
      };
      const execute = () => account.connect(owner).authorizeDelegateeWithProof(
        p.checkpoint,p.signature,bundle,delegatee.address,authorized);
      await assert.rejects(
        () => account.connect(outsider).authorizeDelegateeWithProof.staticCall(
          p.checkpoint,p.signature,bundle,delegatee.address,authorized),
        "Non-owner must not execute valid proof"
      );
      assert.equal(await account.nonce(),nonce);
      await (await execute()).wait();
      assert.equal(await account.nonce(),nonce+1n);
      assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),authorized);
      assert.equal(await bridge.consumedNullifiers(p.nullifier),true);
      assert.equal(await registry.consumedCheckpoints(await registry.checkpointDigest(p.checkpoint)),true);
      await assert.rejects(execute,"Exact authorization replay must revert");
      assert.equal(await account.nonce(),nonce+1n);
      assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),authorized);
    }
    await authorize(true);
    await authorize(false);
  });
});
