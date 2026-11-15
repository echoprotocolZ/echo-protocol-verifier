"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
describe("Echo V4 transaction-binding invariants",function(){
 let harness,owner,outsider,signals,checkpoint;
 beforeEach(async()=>{
  [owner,outsider]=await ethers.getSigners();
  const registry=await(await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
  const verifier=await(await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
  // The harness only invokes binding checks; these deployed contracts satisfy
  // constructor dependency validation, not dual-proof authorization.
  harness=await(await ethers.getContractFactory("EchoV4BindingHarness")).deploy(verifier.target,registry.target);
  const block=await ethers.provider.getBlock("latest");
  const hash=BigInt(ethers.keccak256("0x1234"));
  signals=Array(20).fill(0n);
  signals[10]=(await ethers.provider.getNetwork()).chainId;
  signals[12]=BigInt(block.timestamp+3600);
  signals[6]=BigInt(owner.address);
  signals[7]=0n;
  signals[8]=BigInt.asUintN(128,hash);
  signals[9]=hash>>128n;
  signals[11]=7n;
  checkpoint={
   account:owner.address,delegatee:outsider.address,zoneHash:ethers.ZeroHash,
   checkpointCommitment:ethers.zeroPadValue("0x01",32),
   authorizationCommitment:ethers.zeroPadValue("0x02",32),
   timestamp:block.timestamp,nonce:7
  };
  signals[18]=1n;signals[1]=2n;signals[3]=BigInt(owner.address);
  signals[4]=BigInt(outsider.address);signals[16]=BigInt(block.timestamp-1);
  signals[17]=BigInt(block.timestamp+1);signals[19]=BigInt(block.timestamp);
 });
 const checkTx=()=>harness.checkTransaction(signals,owner.address,0,"0x1234",7);
 it("accepts a correctly bound transaction (binding only, not authorization)",async()=>{
  await checkTx();
 });
 it("rejects a mismatched chain ID",async()=>{
  signals[10]+=1n;
  await assert.rejects(checkTx,/InvalidChain/);
 });
 it("rejects an expired authorization",async()=>{
  signals[12]=0n;
  await assert.rejects(checkTx,/ExpiredAuthorization/);
 });
 it("rejects a changed transaction target",async()=>{
  signals[6]=BigInt(outsider.address);
  await assert.rejects(checkTx,/InvalidTransaction/);
 });
 it("rejects a changed transaction value",async()=>{
  signals[7]=1n;
  await assert.rejects(checkTx,/InvalidTransaction/);
 });
 it("rejects a changed calldata hash",async()=>{
  signals[8]^=1n;
  await assert.rejects(checkTx,/InvalidTransaction/);
 });
 it("rejects a mismatched transaction nonce",async()=>{
  signals[11]=8n;
  await assert.rejects(checkTx,/InvalidNonce/);
 });
 it("accepts matching checkpoint public signals (binding only)",async()=>{
  await harness.checkCheckpoint(checkpoint,signals);
 });
 it("rejects mismatched checkpoint account binding",async()=>{
  signals[3]=BigInt(outsider.address);
  await assert.rejects(()=>harness.checkCheckpoint(checkpoint,signals),/CheckpointBindingMismatch/);
 });
 it("rejects mismatched checkpoint commitment",async()=>{
  signals[18]=3n;
  await assert.rejects(()=>harness.checkCheckpoint(checkpoint,signals),/CheckpointBindingMismatch/);
 });
});
