"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
describe("Echo V4 protected execution target invariants",function(){
 let owner,outsider,registry,bridge,account,dual,gateway,policy;
 beforeEach(async()=>{
  [owner,outsider]=await ethers.getSigners();
  const deploy=async(name,...args)=>{
   const contract=await(await ethers.getContractFactory(name)).deploy(...args);
   await contract.waitForDeployment();return contract;
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
 const checkpoint=accountAddress=>({
  account:accountAddress,delegatee:accountAddress,
  zoneHash:ethers.ZeroHash,checkpointCommitment:ethers.ZeroHash,
  authorizationCommitment:ethers.ZeroHash,timestamp:0,nonce:0
 });
 const a=[0,0],b=[[0,0],[0,0]];
 const execute=(target,cp)=>account.executeAuthorized(
  cp??checkpoint(account.target),"0x",a,b,a,Array(20).fill(0),
  a,b,a,Array(5).fill(0),target,0,"0x"
 );
 const unchanged=async()=>{
  assert.equal(await account.nonce(),0n);
  assert.equal(await account.owner(),owner.address);
  assert.equal(await account.pendingOwner(),ethers.ZeroAddress);
  assert.equal(await account.entryPoint(),ethers.ZeroAddress);
  assert.equal(await bridge.consumedNullifiers(0),false);
 };
 it("rejects zero target with exact InvalidAddress error",async()=>{
  await assert.rejects(()=>execute(ethers.ZeroAddress),/InvalidAddress/);
  await unchanged();
 });
 it("rejects self target with exact InvalidAddress error",async()=>{
  await assert.rejects(()=>execute(account.target),/InvalidAddress/);
  await unchanged();
 });
 it("rejects authorization bridge target with exact InvalidAddress error",async()=>{
  await assert.rejects(()=>execute(bridge.target),/InvalidAddress/);
  await unchanged();
 });
 it("rejects checkpoint registry target with exact InvalidAddress error",async()=>{
  await assert.rejects(()=>execute(registry.target),/InvalidAddress/);
  await unchanged();
 });
 it("rejects dual verifier target with exact InvalidAddress error",async()=>{
  await assert.rejects(()=>execute(dual.target),/InvalidAddress/);
  await unchanged();
 });
 it("rejects geographic gateway target with exact InvalidAddress error",async()=>{
  await assert.rejects(()=>execute(gateway.target),/InvalidAddress/);
  await unchanged();
 });
 it("rejects geographic policy registry target with exact InvalidAddress error",async()=>{
  await assert.rejects(()=>execute(policy.target),/InvalidAddress/);
  await unchanged();
 });
 it("rejects a mismatched checkpoint account before any execution",async()=>{
  await assert.rejects(()=>execute(outsider.address,checkpoint(outsider.address)),/Unauthorized/);
  await unchanged();
 });
 it("rejects outsider execution even when target is not protected",async()=>{
  await assert.rejects(()=>account.connect(outsider).executeAuthorized(
   checkpoint(account.target),"0x",a,b,a,Array(20).fill(0),
   a,b,a,Array(5).fill(0),outsider.address,0,"0x"
  ),/Unauthorized/);
  await unchanged();
 });
 it("rejects outsider execution before a protected target check",async()=>{
  await assert.rejects(()=>account.connect(outsider).executeAuthorized(
   checkpoint(account.target),"0x",a,b,a,Array(20).fill(0),
   a,b,a,Array(5).fill(0),bridge.target,0,"0x"
  ),/Unauthorized/);
  await unchanged();
 });
});
