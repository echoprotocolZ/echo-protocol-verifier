"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
describe("Echo V4 authorization bridge delegatee isolation",function(){
 let owner,alice,bob,bridge;
 beforeEach(async()=>{
  [owner,alice,bob]=await ethers.getSigners();
  const registry=await(await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
  const verifier=await(await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
  bridge=await(await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(verifier.target,registry.target);
 });
 const allowed=(account,delegatee)=>bridge.authorizedDelegatees(account.address,delegatee.address);
 it("starts with no delegatee permissions",async()=>{
  assert.equal(await allowed(owner,alice),false);
  assert.equal(await allowed(owner,bob),false);
 });
 it("allows the owner to grant a delegatee permission",async()=>{
  await(await bridge.connect(owner).setAuthorizedDelegatee(alice.address,true)).wait();
  assert.equal(await allowed(owner,alice),true);
 });
 it("allows the owner to revoke a delegatee permission",async()=>{
  await(await bridge.connect(owner).setAuthorizedDelegatee(alice.address,true)).wait();
  await(await bridge.connect(owner).setAuthorizedDelegatee(alice.address,false)).wait();
  assert.equal(await allowed(owner,alice),false);
 });
 it("does not grant another delegatee implicitly",async()=>{
  await(await bridge.connect(owner).setAuthorizedDelegatee(alice.address,true)).wait();
  assert.equal(await allowed(owner,bob),false);
 });
 it("keeps another account's permissions isolated",async()=>{
  await(await bridge.connect(owner).setAuthorizedDelegatee(alice.address,true)).wait();
  assert.equal(await allowed(bob,alice),false);
 });
 it("cannot revoke another account's permission through a different caller",async()=>{
  await(await bridge.connect(owner).setAuthorizedDelegatee(alice.address,true)).wait();
  await(await bridge.connect(bob).setAuthorizedDelegatee(alice.address,false)).wait();
  assert.equal(await allowed(owner,alice),true);
 });
 it("permits independent account grants to the same delegatee",async()=>{
  await(await bridge.connect(owner).setAuthorizedDelegatee(alice.address,true)).wait();
  await(await bridge.connect(bob).setAuthorizedDelegatee(alice.address,true)).wait();
  assert.equal(await allowed(owner,alice),true);
  assert.equal(await allowed(bob,alice),true);
 });
 it("revoking one account's grant preserves the other account's grant",async()=>{
  await(await bridge.connect(owner).setAuthorizedDelegatee(alice.address,true)).wait();
  await(await bridge.connect(bob).setAuthorizedDelegatee(alice.address,true)).wait();
  await(await bridge.connect(owner).setAuthorizedDelegatee(alice.address,false)).wait();
  assert.equal(await allowed(owner,alice),false);
  assert.equal(await allowed(bob,alice),true);
 });
 it("rejects zero-address grants without changing existing permissions",async()=>{
  await(await bridge.connect(owner).setAuthorizedDelegatee(alice.address,true)).wait();
  await assert.rejects(()=>bridge.connect(owner).setAuthorizedDelegatee(ethers.ZeroAddress,true),/InvalidDelegatee/);
  assert.equal(await allowed(owner,alice),true);
 });
 it("rejects zero-address revocation without changing existing permissions",async()=>{
  await(await bridge.connect(owner).setAuthorizedDelegatee(alice.address,true)).wait();
  await assert.rejects(()=>bridge.connect(owner).setAuthorizedDelegatee(ethers.ZeroAddress,false),/InvalidDelegatee/);
  assert.equal(await allowed(owner,alice),true);
 });
});
