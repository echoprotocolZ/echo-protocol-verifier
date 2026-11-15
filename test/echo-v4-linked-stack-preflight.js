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
});
