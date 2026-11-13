"use strict";
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const { proveAuthorizedCall } = require("./helpers/echo-real-dual-proof");

// This regression proves that an ordinary target contract cannot invoke owner-only
// proof administration during execution. It does NOT establish safety when owner
// itself is a contract; that remains an audit blocker (GitHub issue #4).
describe("Echo V4: target callback into delegation administration", function () {
  this.timeout(240000);
  async function deploy(name, ...args) {
    const c = await (await ethers.getContractFactory(name)).deploy(...args);
    await c.waitForDeployment();
    return c;
  }
  it("rejects target-contract administration callback without consuming its proof", async function () {
    const [owner, validator, delegatee] = await ethers.getSigners();
    const registry = await deploy("EchoAttestationRegistryV3");
    const v3 = await deploy("EchoAuthorizationVerifierV3");
    const v3bridge = await deploy("EchoAuthorizationBridgeV3", v3.target, registry.target);
    const policy = await deploy("EchoGeographicPolicyRegistryV4");
    const v4 = await deploy("EchoGeographicBoundVerifierV4");
    const gateway = await deploy("EchoGeographicProofGatewayV4", v4.target, policy.target);
    const dual = await deploy("EchoDualProofVerifierV4", v3bridge.target, gateway.target);
    const bridge = await deploy("EchoAuthorizationBridgeV4", dual.target, registry.target);
    const zone = {minLat:100050,maxLat:100050,minLon:200000,maxLon:200000};
    const account = await deploy("EchoSmartAccountV4DelegationCandidate",
      owner.address, ethers.ZeroAddress, bridge.target, validator.address, zone, 3600n);
    const probe = await deploy("EchoReentryProbe");

    // Generate an authentic admin proof for nonce 1 (the nonce *during*
    // the outer target callback); otherwise nonce mismatch would mask the
    // authorization boundary this test is meant to exercise.
    const adminIntent = account.interface.encodeFunctionData("delegationIntent", [delegatee.address, true]);
    // delegationIntent is a view helper; use its returned bytes, not its ABI call.
    // It includes nonce 0, so encode the intended nonce-1 payload explicitly.
    const domain = await account.DELEGATION_DOMAIN();
    const chain = (await ethers.provider.getNetwork()).chainId;
    const intendedAdminData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32","uint256","address","address","bool","uint256"],
      [domain,chain,account.target,delegatee.address,true,1n]
    );
    const admin = await proveAuthorizedCall({
      account:account.target,delegatee:account.target,validator,
      registry:registry.target,target:account.target,
      data:intendedAdminData,nonce:1n,zone
    });
    const bundle = {
      v3A:admin.v3A,v3B:admin.v3B,v3C:admin.v3C,v3Signals:admin.v3Signals,
      v4A:admin.v4A,v4B:admin.v4B,v4C:admin.v4C,v4Signals:admin.v4Signals
    };
    const callback = account.interface.encodeFunctionData("authorizeDelegateeWithProof",
      [admin.checkpoint,admin.signature,bundle,delegatee.address,true]);
    await (await probe.configure(account.target,callback)).wait();

    const data = probe.interface.encodeFunctionData("trigger");
    const outer = await proveAuthorizedCall({
      account:account.target,delegatee:account.target,validator,
      registry:registry.target,target:probe.target,data,nonce:0n,zone
    });
    await (await account.connect(owner).executeAuthorized(
      outer.checkpoint,outer.signature,outer.v3A,outer.v3B,outer.v3C,outer.v3Signals,
      outer.v4A,outer.v4B,outer.v4C,outer.v4Signals,probe.target,0n,data
    )).wait();

    assert.equal(await probe.attempted(),true);
    assert.equal(await probe.blocked(),true);
    assert.equal(await account.nonce(),1n);
    assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),false);
    assert.equal(await bridge.consumedNullifiers(admin.nullifier),false);
    // The failure here is owner authorization, not proof of a shared lock.
    assert.equal(adminIntent.length > 0,true);
  });
});
