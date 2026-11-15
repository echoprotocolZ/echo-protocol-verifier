"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");

// Production-contract integration gate: deliberately INVALID Groth16 inputs.
// This does NOT demonstrate successful proof-backed execution.
describe("Echo V4 real-verifier integration rejection gate",function(){
 let owner,registry,v3Bridge,gateway,dual,policy;
 const deploy=async(name,...args)=>{
  const c=await(await ethers.getContractFactory(name)).deploy(...args);
  await c.waitForDeployment();return c;
 };
 beforeEach(async()=>{
  [owner]=await ethers.getSigners();
  registry=await deploy("EchoAttestationRegistryV3");
  const v3Verifier=await deploy("EchoAuthorizationVerifierV3");
  v3Bridge=await deploy("EchoAuthorizationBridgeV3",v3Verifier.target,registry.target);
  const geoVerifier=await deploy("EchoGeographicBoundVerifierV4");
  policy=await deploy("EchoGeographicPolicyRegistryV4");
  gateway=await deploy("EchoGeographicProofGatewayV4",geoVerifier.target,policy.target);
  dual=await deploy("EchoDualProofVerifierV4",v3Bridge.target,gateway.target);
 });
 const zone={minLat:0,maxLat:0,minLon:0,maxLon:0};
 const checkpoint=()=>({
  account:owner.address,delegatee:owner.address,zoneHash:ethers.ZeroHash,
  checkpointCommitment:ethers.ZeroHash,authorizationCommitment:ethers.ZeroHash,
  timestamp:0,nonce:0
 });
 const a=[0,0],b=[[0,0],[0,0]];
 const v3=()=>{const s=Array(20).fill(0);s[3]=BigInt(owner.address);s[4]=BigInt(owner.address);return s;};
 it("rejects V3 zero proof at the real V3 verifier after matching checkpoint fields",async()=>{
  await assert.rejects(
   ()=>v3Bridge.verifyCheckpointProof(checkpoint(),a,b,a,v3()),
   /InvalidProof/
  );
 });
 it("rejects unapproved geographic zone before evaluating the proof",async()=>{
  await assert.rejects(
   ()=>gateway.verifyApprovedGeographicProof(owner.address,owner.address,ethers.ZeroHash,a,b,a,[0,0,0,0,0]),
   /GeographicPolicyDisabled/
  );
 });
 it("rejects invalid geographic proof after approving its exact zone",async()=>{
  await(await policy.setGeographicPolicy(owner.address,zone)).wait();
  await assert.rejects(
   ()=>gateway.verifyApprovedGeographicProof(owner.address,owner.address,ethers.ZeroHash,a,b,a,[0,0,0,0,0]),
   /InvalidGeographicProof/
  );
 });
 it("rejects geographic proof after explicit policy revocation",async()=>{
  await(await policy.setGeographicPolicy(owner.address,zone)).wait();
  await(await policy.disableGeographicPolicy(owner.address)).wait();
  await assert.rejects(
   ()=>gateway.verifyApprovedGeographicProof(owner.address,owner.address,ethers.ZeroHash,a,b,a,[0,0,0,0,0]),
   /GeographicPolicyDisabled/
  );
 });
 it("keeps the real dual verifier from accepting an invalid V3 proof",async()=>{
  const cp=checkpoint();
  const zoneHash=ethers.solidityPackedKeccak256(["uint32","uint32","uint32","uint32"],[0,0,0,0]);
  // Use the exact zone hashing function via an approved policy record.
  await(await policy.setGeographicPolicy(owner.address,zone)).wait();
  const approved=await policy.getGeographicPolicy(owner.address,owner.address);
  cp.zoneHash=approved.zoneHash;
  await assert.rejects(
   ()=>dual.verifyDualProof(cp,a,b,a,v3(),a,b,a,[0,0,0,0,0]),
   /InvalidProof|InvalidV3Proof/
  );
 });
});
