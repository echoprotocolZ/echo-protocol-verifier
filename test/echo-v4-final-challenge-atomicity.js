"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
describe("Echo V4 final security challenge: execution rejection atomicity",function(){
 let owner,outsider,registry,bridge,account,dual,gateway,policy;
 beforeEach(async()=>{
  [owner,outsider]=await ethers.getSigners();
  const deploy=async(name,...args)=>{
   const c=await(await ethers.getContractFactory(name)).deploy(...args);
   await c.waitForDeployment();return c;
  };
  registry=await deploy("EchoAttestationRegistryV3");
  const v3Verifier=await deploy("EchoAuthorizationVerifierV3");
  const v3Bridge=await deploy("EchoAuthorizationBridgeV3",v3Verifier.target,registry.target);
  const geoVerifier=await deploy("EchoGeographicBoundVerifierV4");
  policy=await deploy("EchoGeographicPolicyRegistryV4");
  gateway=await deploy("EchoGeographicProofGatewayV4",geoVerifier.target,policy.target);
  dual=await deploy("EchoDualProofVerifierV4",v3Bridge.target,gateway.target);
  bridge=await deploy("EchoAuthorizationBridgeV4",dual.target,registry.target);
  account=await deploy("EchoSmartAccountV4",owner.address,ethers.ZeroAddress,bridge.target);
 });
 const checkpoint=(accountAddress)=>({
  account:accountAddress,delegatee:accountAddress,zoneHash:ethers.ZeroHash,
  checkpointCommitment:ethers.ZeroHash,authorizationCommitment:ethers.ZeroHash,
  timestamp:0,nonce:0
 });
 const a=[0,0],b=[[0,0],[0,0]];
 const attempt=(target,cp)=>account.executeAuthorized(
  cp??checkpoint(account.target),"0x",a,b,a,Array(20).fill(0),
  a,b,a,Array(5).fill(0),target,0,"0x"
 );
 const state=async()=>({
  nonce:await account.nonce(),
  owner:await account.owner(),
  pending:await account.pendingOwner(),
  entry:await account.entryPoint(),
  bridge:await account.authorizationBridge(),
  registry:await bridge.checkpointRegistry(),
  verifier:await bridge.dualProofVerifier(),
  nullifier0:await bridge.consumedNullifiers(0),
  nullifier1:await bridge.consumedNullifiers(1)
 });
 it("keeps complete account and bridge state unchanged after self-target rejection",async()=>{
  const before=await state();
  await assert.rejects(()=>attempt(account.target),/InvalidAddress/);
  assert.deepEqual(await state(),before);
 });
 it("keeps complete account and bridge state unchanged after gateway-target rejection",async()=>{
  const before=await state();
  await assert.rejects(()=>attempt(gateway.target),/InvalidAddress/);
  assert.deepEqual(await state(),before);
 });
 it("keeps complete account and bridge state unchanged after policy-registry-target rejection",async()=>{
  const before=await state();
  await assert.rejects(()=>attempt(policy.target),/InvalidAddress/);
  assert.deepEqual(await state(),before);
 });
 it("keeps complete account and bridge state unchanged after mismatched checkpoint rejection",async()=>{
  const before=await state();
  await assert.rejects(()=>attempt(outsider.address,checkpoint(outsider.address)),/Unauthorized/);
  assert.deepEqual(await state(),before);
 });
 it("keeps complete account and bridge state unchanged after unauthorized caller rejection",async()=>{
  const before=await state();
  await assert.rejects(()=>account.connect(outsider).executeAuthorized(
   checkpoint(account.target),"0x",a,b,a,Array(20).fill(0),
   a,b,a,Array(5).fill(0),outsider.address,0,"0x"
  ),/Unauthorized/);
  assert.deepEqual(await state(),before);
 });
});
