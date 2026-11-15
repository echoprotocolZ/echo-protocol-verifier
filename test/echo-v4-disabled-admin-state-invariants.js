"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
describe("Echo V4 disabled administration state invariants",function(){
 let owner,outsider,registry,bridge,account;
 beforeEach(async()=>{
  [owner,outsider]=await ethers.getSigners();
  registry=await(await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
  const verifier=await(await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
  bridge=await(await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(verifier.target,registry.target);
  account=await(await ethers.getContractFactory("EchoSmartAccountV4")).deploy(owner.address,ethers.ZeroAddress,bridge.target);
 });
 const unchanged=async()=>{
  assert.equal(await account.owner(),owner.address);
  assert.equal(await account.pendingOwner(),ethers.ZeroAddress);
  assert.equal(await account.entryPoint(),ethers.ZeroAddress);
  assert.equal(await account.authorizationBridge(),bridge.target);
  assert.equal(await account.nonce(),0n);
 };
 it("rejects owner initiated ownership transfer without changing state",async()=>{
  await assert.rejects(()=>account.transferOwnership(outsider.address),/Unauthorized/);
  await unchanged();
 });
 it("rejects outsider initiated ownership transfer without changing state",async()=>{
  await assert.rejects(()=>account.connect(outsider).transferOwnership(outsider.address),/Unauthorized/);
  await unchanged();
 });
 it("rejects owner ownership acceptance without changing state",async()=>{
  await assert.rejects(()=>account.acceptOwnership(),/Unauthorized/);
  await unchanged();
 });
 it("rejects outsider ownership acceptance without changing state",async()=>{
  await assert.rejects(()=>account.connect(outsider).acceptOwnership(),/Unauthorized/);
  await unchanged();
 });
 it("rejects owner entry point changes without changing state",async()=>{
  await assert.rejects(()=>account.setEntryPoint(outsider.address),/Unauthorized/);
  await unchanged();
 });
 it("rejects outsider entry point changes without changing state",async()=>{
  await assert.rejects(()=>account.connect(outsider).setEntryPoint(outsider.address),/Unauthorized/);
  await unchanged();
 });
 it("rejects owner arbitrary administration without changing state",async()=>{
  await assert.rejects(()=>account.executeAdministration(registry.target,"0x1234"),/Unauthorized/);
  await unchanged();
 });
 it("rejects outsider arbitrary administration without changing state",async()=>{
  await assert.rejects(()=>account.connect(outsider).executeAdministration(registry.target,"0x1234"),/Unauthorized/);
  await unchanged();
 });
 it("rejects owner geographic administration without changing state",async()=>{
  await assert.rejects(()=>account.executeGeographicAdministration("0x1234"),/Unauthorized/);
  await unchanged();
 });
 it("rejects outsider geographic administration without changing state",async()=>{
  await assert.rejects(()=>account.connect(outsider).executeGeographicAdministration("0x1234"),/Unauthorized/);
  await unchanged();
 });
});
