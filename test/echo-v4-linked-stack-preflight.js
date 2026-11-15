"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
describe("Echo V4 linked-stack execution preflight",function(){
 let owner,outsider,registry,bridge,account,policy;
 const deploy=async(name,...args)=>{
  const c=await(await ethers.getContractFactory(name)).deploy(...args);
  await c.waitForDeployment();return c;
 };
 beforeEach(async()=>{
  [owner,outsider]=await ethers.getSigners();
  registry=await deploy("EchoAttestationRegistryV3");
  const v3Verifier=await deploy("EchoAuthorizationVerifierV3");
  const v3Bridge=await deploy("EchoAuthorizationBridgeV3",v3Verifier.target,registry.target);
  const geoVerifier=await deploy("EchoGeographicBoundVerifierV4");
  policy=await deploy("EchoGeographicPolicyRegistryV4");
  const gateway=await deploy("EchoGeographicProofGatewayV4",geoVerifier.target,policy.target);
  const dual=await deploy("EchoDualProofVerifierV4",v3Bridge.target,gateway.target);
  bridge=await deploy("EchoAuthorizationBridgeV4",dual.target,registry.target);
  account=await deploy("EchoSmartAccountV4",owner.address,ethers.ZeroAddress,bridge.target);
 });
 const blankCheckpoint=account=>({
  account,delegatee:account,zoneHash:ethers.ZeroHash,
  checkpointCommitment:ethers.ZeroHash,authorizationCommitment:ethers.ZeroHash,
  timestamp:0,nonce:0
 });
 const zeros2=[0,0],zerosB=[[0,0],[0,0]];
 function attempt(checkpoint,target){
  return account.connect(owner).executeAuthorized(
   checkpoint,"0x",zeros2,zerosB,zeros2,Array(20).fill(0),
   zeros2,zerosB,zeros2,Array(5).fill(0),target,0,"0x"
  );
 }
 it("wires the bridge and account to the intended registry",async()=>{
  assert.equal(await account.authorizationBridge(),bridge.target);
  assert.equal(await bridge.checkpointRegistry(),registry.target);
  assert.equal(await account.nonce(),0n);
 });
 it("rejects a checkpoint naming a different account without consuming nonce",async()=>{
  await assert.rejects(async()=>{await(attempt(blankCheckpoint(outsider.address),outsider.address)).wait()});
  assert.equal(await account.nonce(),0n);
  assert.equal(await bridge.consumedNullifiers(0),false);
 });
 it("rejects missing dual proofs on a linked stack without advancing nonce",async()=>{
  await assert.rejects(async()=>{await(attempt(blankCheckpoint(account.target),outsider.address)).wait()});
  assert.equal(await account.nonce(),0n);
  assert.equal(await bridge.consumedNullifiers(0),false);
 });
 it("rejects attempts to target the authorization bridge",async()=>{
  await assert.rejects(async()=>{await(attempt(blankCheckpoint(account.target),bridge.target)).wait()});
  assert.equal(await account.nonce(),0n);
 });
 it("rejects a zero-address execution target without consuming nonce",async()=>{
  await assert.rejects(async()=>{await(attempt(blankCheckpoint(account.target),ethers.ZeroAddress)).wait()});
  assert.equal(await account.nonce(),0n);
 });
 it("rejects targeting the smart account itself without consuming nonce",async()=>{
  await assert.rejects(async()=>{await(attempt(blankCheckpoint(account.target),account.target)).wait()});
  assert.equal(await account.nonce(),0n);
 });
 it("rejects an outsider caller without consuming nonce",async()=>{
  await assert.rejects(async()=>{
   await(account.connect(outsider).executeAuthorized(
    blankCheckpoint(account.target),"0x",zeros2,zerosB,zeros2,Array(20).fill(0),
    zeros2,zerosB,zeros2,Array(5).fill(0),outsider.address,0,"0x"
   )).wait();
  });
  assert.equal(await account.nonce(),0n);
 });
 it("rejects proof-free ownership transfer without changing owner",async()=>{
  await assert.rejects(async()=>{await(account.transferOwnership(outsider.address)).wait()});
  assert.equal(await account.owner(),owner.address);
  assert.equal(await account.pendingOwner(),ethers.ZeroAddress);
 });
 it("rejects proof-free entry-point changes without changing configuration",async()=>{
  await assert.rejects(async()=>{await(account.setEntryPoint(outsider.address)).wait()});
  assert.equal(await account.entryPoint(),ethers.ZeroAddress);
 });

 it("rejects targeting the checkpoint registry without advancing nonce",async()=>{
  await assert.rejects(async()=>{await(attempt(blankCheckpoint(account.target),registry.target)).wait()});
  assert.equal(await account.nonce(),0n);
 });
 it("rejects targeting the dual-proof verifier without advancing nonce",async()=>{
  const dual=await bridge.dualProofVerifier();
  await assert.rejects(async()=>{await(attempt(blankCheckpoint(account.target),dual)).wait()});
  assert.equal(await account.nonce(),0n);
 });
 it("rejects targeting the geographic gateway without advancing nonce",async()=>{
  const dual=await ethers.getContractAt("EchoDualProofVerifierV4",await bridge.dualProofVerifier());
  const gateway=await dual.v4Gateway();
  await assert.rejects(async()=>{await(attempt(blankCheckpoint(account.target),gateway)).wait()});
  assert.equal(await account.nonce(),0n);
 });
 it("rejects targeting the geographic policy registry without advancing nonce",async()=>{
  await assert.rejects(async()=>{await(attempt(blankCheckpoint(account.target),policy.target)).wait()});
  assert.equal(await account.nonce(),0n);
 });
 it("rejects proof-free administrative execution without advancing nonce",async()=>{
  await assert.rejects(async()=>{await(account.executeAdministration(registry.target,"0x")).wait()});
  assert.equal(await account.nonce(),0n);
 });
 it("rejects proof-free geographic administration without advancing nonce",async()=>{
  await assert.rejects(async()=>{await(account.executeGeographicAdministration("0x")).wait()});
  assert.equal(await account.nonce(),0n);
 });
 it("reports InvalidAddress for the zero execution target",async()=>{
  await assert.rejects(()=>attempt(blankCheckpoint(account.target),ethers.ZeroAddress),/InvalidAddress/);
  assert.equal(await account.nonce(),0n);
 });
 it("reports InvalidAddress for self-targeted execution",async()=>{
  await assert.rejects(()=>attempt(blankCheckpoint(account.target),account.target),/InvalidAddress/);
  assert.equal(await account.nonce(),0n);
 });
 it("reports InvalidAddress for targeting the authorization bridge",async()=>{
  await assert.rejects(()=>attempt(blankCheckpoint(account.target),bridge.target),/InvalidAddress/);
  assert.equal(await account.nonce(),0n);
 });
 it("reports InvalidAddress for targeting the checkpoint registry",async()=>{
  await assert.rejects(()=>attempt(blankCheckpoint(account.target),registry.target),/InvalidAddress/);
  assert.equal(await account.nonce(),0n);
 });
 it("reports InvalidAddress for targeting the dual verifier",async()=>{
  const dualVerifierAddress = await bridge.dualProofVerifier();
  await assert.rejects(()=>attempt(blankCheckpoint(account.target),dualVerifierAddress),/InvalidAddress/);
  assert.equal(await account.nonce(),0n);
 });
 it("reports Unauthorized for an unrelated caller",async()=>{
  await assert.rejects(()=>account.connect(outsider).executeAuthorized(
   blankCheckpoint(account.target),"0x",zeros2,zerosB,zeros2,Array(20).fill(0),
   zeros2,zerosB,zeros2,Array(5).fill(0),owner.address,0,"0x"
  ),/Unauthorized/);
  assert.equal(await account.nonce(),0n);
 });
 it("reports Unauthorized when checkpoint names another account",async()=>{
  await assert.rejects(()=>attempt(blankCheckpoint(outsider.address),owner.address),/Unauthorized/);
  assert.equal(await account.nonce(),0n);
 });

});
