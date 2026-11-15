"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
describe("Echo V4 ownership intent payload validation",function(){
 let owner,outsider,account;
 beforeEach(async()=>{
  [owner,outsider]=await ethers.getSigners();
  const registry=await(await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
  const verifier=await(await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
  const bridge=await(await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(verifier.target,registry.target);
  account=await(await ethers.getContractFactory("EchoSmartAccountV4")).deploy(owner.address,ethers.ZeroAddress,bridge.target);
 });
 const preview=(successor,deadline)=>account.ownershipProposalIntent(successor,deadline);
 const unchanged=async()=>{
  assert.equal(await account.owner(),owner.address);
  assert.equal(await account.pendingOwner(),ethers.ZeroAddress);
  assert.equal(await account.nonce(),0n);
 };
 it("rejects a zero successor address",async()=>{
  await assert.rejects(()=>preview(ethers.ZeroAddress,1),/InvalidSuccessor/);
  await unchanged();
 });
 it("rejects the smart account itself as successor",async()=>{
  await assert.rejects(()=>preview(account.target,1),/InvalidSuccessor/);
  await unchanged();
 });
 it("rejects zero deadline with a valid successor",async()=>{
  await assert.rejects(()=>preview(outsider.address,0),/InvalidDeadline/);
  await unchanged();
 });
 it("prioritizes invalid successor when both successor and deadline are zero",async()=>{
  await assert.rejects(()=>preview(ethers.ZeroAddress,0),/InvalidSuccessor/);
  await unchanged();
 });
 it("encodes a nonzero deadline and valid successor",async()=>{
  const bytes=await preview(outsider.address,1);
  assert.ok(ethers.isHexString(bytes));
  assert.ok(bytes.length>2);
  await unchanged();
 });
 it("encodes a large nonzero deadline without modifying state",async()=>{
  const bytes=await preview(outsider.address,2n**128n);
  assert.ok(ethers.isHexString(bytes));
  await unchanged();
 });
 it("does not authorize ownership transfer after a valid preview",async()=>{
  await preview(outsider.address,1);
  await assert.rejects(()=>account.transferOwnership(outsider.address),/Unauthorized/);
  await unchanged();
 });
 it("does not authorize ownership acceptance after a valid preview",async()=>{
  await preview(outsider.address,1);
  await assert.rejects(()=>account.connect(outsider).acceptOwnership(),/Unauthorized/);
  await unchanged();
 });
 it("does not authorize entry point changes after a valid preview",async()=>{
  await preview(outsider.address,1);
  await assert.rejects(()=>account.setEntryPoint(outsider.address),/Unauthorized/);
  await unchanged();
 });
 it("preserves intent bytes across repeated reads after rejected administration",async()=>{
  const before=await preview(outsider.address,1);
  await assert.rejects(()=>account.transferOwnership(outsider.address),/Unauthorized/);
  assert.equal(await preview(outsider.address,1),before);
  await unchanged();
 });
});
