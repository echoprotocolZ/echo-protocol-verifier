"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
const {proveAuthorizedCall}=require("./helpers/echo-real-dual-proof");
describe("Echo V4: real-proof geographic administration and external execution",function(){
 this.timeout(240000);
 async function deploy(n,...a){const c=await(await ethers.getContractFactory(n)).deploy(...a);await c.waitForDeployment();return c;}
 it("approves delegatee, enables geographic policy, executes, revokes, and denies fresh proof",async function(){
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
 const bundle=p=>({v3A:p.v3A,v3B:p.v3B,v3C:p.v3C,v3Signals:p.v3Signals,v4A:p.v4A,v4B:p.v4B,v4C:p.v4C,v4Signals:p.v4Signals});
 async function proofFor(who,destination,data){
  return proveAuthorizedCall({account:account.target,delegatee:who,validator,registry:registry.target,target:destination,data,value:0n,nonce:await account.nonce(),zone});
 }
 async function permission(enabled){
  const data=await account.delegationIntent(delegatee.address,enabled);
  const p=await proofFor(account.target,account.target,data);
  await(await account.connect(owner).authorizeDelegateeWithProof(p.checkpoint,p.signature,bundle(p),delegatee.address,enabled)).wait();
  assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),enabled);
 }
 await permission(true);
 assert.equal(await account.nonce(),1n);
 const geoIntent=await account.geographicPolicyIntent(delegatee.address,zone,true);
 const geoProof=await proofFor(account.target,account.target,geoIntent);
 await(await account.connect(owner).authorizeGeographicPolicyWithProof(
  geoProof.checkpoint,geoProof.signature,bundle(geoProof),delegatee.address,zone,true)).wait();
 assert.equal(await account.nonce(),2n);
 const geo=await policy.getGeographicPolicy(account.target,delegatee.address);
 assert.equal(geo.enabled,true);
 assert.equal(geo.zoneHash,geoProof.checkpoint.zoneHash);
 assert.equal(await bridge.consumedNullifiers(geoProof.nullifier),true);
 const callData="0x";
 const execution=await proofFor(delegatee.address,target.address,callData);
 const receipt=await(await account.connect(delegatee).executeAuthorized(
  execution.checkpoint,execution.signature,
  execution.v3A,execution.v3B,execution.v3C,execution.v3Signals,
  execution.v4A,execution.v4B,execution.v4C,execution.v4Signals,
  target.address,0n,callData)).wait();
 assert.equal(receipt.status,1);
 assert.equal(await account.nonce(),3n);
 assert.equal(await bridge.consumedNullifiers(execution.nullifier),true);
 await permission(false);
 assert.equal(await account.nonce(),4n);
 const rejected=await proofFor(delegatee.address,target.address,callData);
 const digest=await registry.checkpointDigest(rejected.checkpoint);
 await assert.rejects(async()=>{
  const tx=await account.connect(delegatee).executeAuthorized(
   rejected.checkpoint,rejected.signature,
   rejected.v3A,rejected.v3B,rejected.v3C,rejected.v3Signals,
   rejected.v4A,rejected.v4B,rejected.v4C,rejected.v4Signals,
   target.address,0n,callData);
  await tx.wait();
 },/UnauthorizedDelegatee/);
 assert.equal(await account.nonce(),4n);
 assert.equal(await bridge.consumedNullifiers(rejected.nullifier),false);
 assert.equal(await registry.consumedCheckpoints(digest),false);
 });
});
