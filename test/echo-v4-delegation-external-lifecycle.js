"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
const {proveAuthorizedCall}=require("./helpers/echo-real-dual-proof");
describe("Echo V4 candidate: external delegatee lifecycle with real dual proofs",function(){
 this.timeout(240000);
 async function deploy(name,...args){const c=await(await ethers.getContractFactory(name)).deploy(...args);await c.waitForDeployment();return c;}
 it("approves, enforces missing geographic policy, revokes, and preserves state",async function(){
  const [owner,validator,delegatee,target]=await ethers.getSigners();
  const registry=await deploy("EchoAttestationRegistryV3");
  const v3=await deploy("EchoAuthorizationVerifierV3");
  const v3bridge=await deploy("EchoAuthorizationBridgeV3",v3.target,registry.target);
  const policy=await deploy("EchoGeographicPolicyRegistryV4");
  const v4=await deploy("EchoGeographicBoundVerifierV4");
  const gateway=await deploy("EchoGeographicProofGatewayV4",v4.target,policy.target);
  const dual=await deploy("EchoDualProofVerifierV4",v3bridge.target,gateway.target);
  const bridge=await deploy("EchoAuthorizationBridgeV4",dual.target,registry.target);
  const zone={minLat:100050,maxLat:100050,minLon:200000,maxLon:200000};
  const account=await deploy("EchoSmartAccountV4DelegationCandidate",owner.address,ethers.ZeroAddress,bridge.target,validator.address,zone,3600n);
  async function proofFor(who,destination,data){
   return proveAuthorizedCall({account:account.target,delegatee:who,validator,registry:registry.target,target:destination,data,nonce:await account.nonce(),zone});
  }
  function bundle(p){return {v3A:p.v3A,v3B:p.v3B,v3C:p.v3C,v3Signals:p.v3Signals,v4A:p.v4A,v4B:p.v4B,v4C:p.v4C,v4Signals:p.v4Signals};}
  async function setPermission(authorized){
   const p=await proofFor(account.target,account.target,await account.delegationIntent(delegatee.address,authorized));
   await(await account.connect(owner).authorizeDelegateeWithProof(p.checkpoint,p.signature,bundle(p),delegatee.address,authorized)).wait();
   assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),authorized);
  }
  await setPermission(true);
  assert.equal(await account.nonce(),1n);
  // External delegatees have no bootstrapped geographic policy.
  // This is an intentional deny-by-default boundary, not a proof failure.
  const callData="0x";
  const approved=await proofFor(delegatee.address,target.address,callData);
  const approvalDigest=await registry.checkpointDigest(approved.checkpoint);
  assert.equal((await policy.getGeographicPolicy(account.target,delegatee.address)).enabled,false);
  await assert.rejects(async()=>{
   const tx=await account.connect(delegatee).executeAuthorized(
    approved.checkpoint,approved.signature,
    approved.v3A,approved.v3B,approved.v3C,approved.v3Signals,
    approved.v4A,approved.v4B,approved.v4C,approved.v4Signals,
    target.address,0n,callData);
   await tx.wait();
  },/GeographicPolicyDisabled/);
  assert.equal(await account.nonce(),1n);
  assert.equal(await bridge.consumedNullifiers(approved.nullifier),false);
  assert.equal(await registry.consumedCheckpoints(approvalDigest),false);
  await setPermission(false);
  assert.equal(await account.nonce(),3n);
  // Fresh, cryptographically valid proof for the revoked external delegatee.
  const rejected=await proofFor(delegatee.address,target.address,callData);
  assert.equal(await bridge.consumedNullifiers(rejected.nullifier),false);
  const digest=await registry.checkpointDigest(rejected.checkpoint);
  await assert.rejects(async()=>{
   const tx=await account.connect(delegatee).executeAuthorized(
    rejected.checkpoint,rejected.signature,
    rejected.v3A,rejected.v3B,rejected.v3C,rejected.v3Signals,
    rejected.v4A,rejected.v4B,rejected.v4C,rejected.v4Signals,
    target.address,0n,callData);
   await tx.wait();
  },"Revoked delegatee must not execute despite fresh valid proofs");
  assert.equal(await account.nonce(),3n);
  assert.equal(await bridge.consumedNullifiers(rejected.nullifier),false);
  assert.equal(await registry.consumedCheckpoints(digest),false);
  assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),false);
 });
});
