"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
describe("Echo V4 bridge authorization boundary",function(){
 let owner,outsider,bridge,account,registry;
 const deploy=async(name,...args)=>{
  const c=await(await ethers.getContractFactory(name)).deploy(...args);
  await c.waitForDeployment();return c;
 };
 beforeEach(async()=>{
  [owner,outsider]=await ethers.getSigners();
  registry=await deploy("EchoAttestationRegistryV3");
  const v3Verifier=await deploy("EchoAuthorizationVerifierV3");
  const v3Bridge=await deploy("EchoAuthorizationBridgeV3",v3Verifier.target,registry.target);
  const geographicVerifier=await deploy("EchoGeographicBoundVerifierV4");
  const policy=await deploy("EchoGeographicPolicyRegistryV4");
  const gateway=await deploy("EchoGeographicProofGatewayV4",geographicVerifier.target,policy.target);
  const dual=await deploy("EchoDualProofVerifierV4",v3Bridge.target,gateway.target);
  bridge=await deploy("EchoAuthorizationBridgeV4",dual.target,registry.target);
  account=await deploy("EchoSmartAccountV4",owner.address,ethers.ZeroAddress,bridge.target);
 });
 const checkpoint=(account,delegatee)=>({
  account,delegatee,zoneHash:ethers.ZeroHash,
  checkpointCommitment:ethers.ZeroHash,authorizationCommitment:ethers.ZeroHash,
  timestamp:0,nonce:0
 });
 const a=[0,0],b=[[0,0],[0,0]];
 const authorize=(signer,cp)=>bridge.connect(signer).authorize(
  cp,"0x",a,b,a,Array(20).fill(0),a,b,a,Array(5).fill(0),outsider.address,0,"0x",0
 );
 it("rejects direct EOA authorization for a deployed smart account",async()=>{
  await assert.rejects(()=>authorize(owner,checkpoint(account.target,account.target)),/UnauthorizedAccount/);
  assert.equal(await bridge.consumedNullifiers(0),false);
 });
 it("rejects direct authorization by an unrelated caller",async()=>{
  await assert.rejects(()=>authorize(outsider,checkpoint(account.target,account.target)),/UnauthorizedAccount/);
  assert.equal(await account.nonce(),0n);
 });
 it("rejects authorization for an EOA checkpoint account from a different EOA",async()=>{
  await assert.rejects(()=>authorize(owner,checkpoint(outsider.address,outsider.address)),/UnauthorizedAccount/);
 });
 it("rejects zero-address delegatee registration",async()=>{
  await assert.rejects(()=>bridge.setAuthorizedDelegatee(ethers.ZeroAddress,true),/InvalidDelegatee/);
  assert.equal(await bridge.authorizedDelegatees(owner.address,ethers.ZeroAddress),false);
 });
 it("allows a caller to set and revoke only its own delegatee permission",async()=>{
  await(await bridge.setAuthorizedDelegatee(outsider.address,true)).wait();
  assert.equal(await bridge.authorizedDelegatees(owner.address,outsider.address),true);
  assert.equal(await bridge.authorizedDelegatees(outsider.address,owner.address),false);
  await(await bridge.setAuthorizedDelegatee(outsider.address,false)).wait();
  assert.equal(await bridge.authorizedDelegatees(owner.address,outsider.address),false);
 });
 it("does not let a second caller overwrite the first caller's delegatee permission",async()=>{
  await(await bridge.setAuthorizedDelegatee(outsider.address,true)).wait();
  await(await bridge.connect(outsider).setAuthorizedDelegatee(owner.address,true)).wait();
  assert.equal(await bridge.authorizedDelegatees(owner.address,outsider.address),true);
  assert.equal(await bridge.authorizedDelegatees(outsider.address,owner.address),true);
  await(await bridge.connect(outsider).setAuthorizedDelegatee(owner.address,false)).wait();
  assert.equal(await bridge.authorizedDelegatees(owner.address,outsider.address),true);
 });
});
