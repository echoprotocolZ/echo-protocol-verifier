"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
describe("Echo V4 ownership intent preview invariants",function(){
 let owner,outsider,account;
 beforeEach(async()=>{
  [owner,outsider]=await ethers.getSigners();
  const registry=await(await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
  const verifier=await(await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
  const bridge=await(await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(verifier.target,registry.target);
  account=await(await ethers.getContractFactory("EchoSmartAccountV4")).deploy(owner.address,ethers.ZeroAddress,bridge.target);
 });
 const intent=(successor,deadline)=>account.ownershipProposalIntent(successor,deadline);
 it("returns stable bytes for identical inputs",async()=>{
  assert.equal(await intent(outsider.address,12345),await intent(outsider.address,12345));
 });
 it("changes payload when successor changes",async()=>{
  assert.notEqual(await intent(outsider.address,12345),await intent(owner.address,12345));
 });
 it("changes payload when deadline changes",async()=>{
  assert.notEqual(await intent(outsider.address,12345),await intent(outsider.address,12346));
 });
 it("changes payload across account instances",async()=>{
  const factory=await ethers.getContractFactory("EchoSmartAccountV4");
  const other=await factory.deploy(owner.address,ethers.ZeroAddress,await account.authorizationBridge());
  await other.waitForDeployment();
  assert.notEqual(await intent(outsider.address,12345),await other.ownershipProposalIntent(outsider.address,12345));
 });
 it("does not alter nonce when previewing an intent",async()=>{
  await intent(outsider.address,12345);
  assert.equal(await account.nonce(),0n);
 });
 it("does not initiate ownership transfer when previewing an intent",async()=>{
  await intent(outsider.address,12345);
  assert.equal(await account.owner(),owner.address);
  assert.equal(await account.pendingOwner(),ethers.ZeroAddress);
 });
 it("returns the same preview to owner and outsider",async()=>{
  assert.equal(await intent(outsider.address,12345),await account.connect(outsider).ownershipProposalIntent(outsider.address,12345));
 });
 it("rejects a zero deadline without changing account state",async()=>{
  await assert.rejects(()=>intent(outsider.address,0),/InvalidDeadline/);
  assert.equal(await account.nonce(),0n);
  assert.equal(await account.owner(),owner.address);
  assert.equal(await account.pendingOwner(),ethers.ZeroAddress);
 });
 it("does not grant administrative rights through repeated previews",async()=>{
  await intent(outsider.address,12345);
  await intent(outsider.address,12345);
  await assert.rejects(()=>account.transferOwnership(outsider.address),/Unauthorized/);
  assert.equal(await account.pendingOwner(),ethers.ZeroAddress);
 });
 it("does not change entry point after generating an ownership preview",async()=>{
  await intent(outsider.address,12345);
  assert.equal(await account.entryPoint(),ethers.ZeroAddress);
 });
});
