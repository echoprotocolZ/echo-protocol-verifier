"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
describe("Echo V4 constructor dependency integrity",function(){
 let owner,other,registry,verifier,bridge;
 beforeEach(async()=>{
  [owner,other]=await ethers.getSigners();
  registry=await(await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
  verifier=await(await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
  bridge=await(await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(verifier.target,registry.target);
 });
 const bridgeFactory=()=>ethers.getContractFactory("EchoAuthorizationBridgeV4");
 const accountFactory=()=>ethers.getContractFactory("EchoSmartAccountV4");
 it("rejects zero verifier dependency",async()=>{
  const f=await bridgeFactory();
  await assert.rejects(()=>f.deploy(ethers.ZeroAddress,registry.target),/InvalidDependency/);
 });
 it("rejects zero registry dependency",async()=>{
  const f=await bridgeFactory();
  await assert.rejects(()=>f.deploy(verifier.target,ethers.ZeroAddress),/InvalidDependency/);
 });
 it("rejects an EOA verifier dependency",async()=>{
  const f=await bridgeFactory();
  await assert.rejects(()=>f.deploy(other.address,registry.target),/InvalidDependency/);
 });
 it("rejects an EOA registry dependency",async()=>{
  const f=await bridgeFactory();
  await assert.rejects(()=>f.deploy(verifier.target,other.address),/InvalidDependency/);
 });
 it("rejects a zero smart-account owner",async()=>{
  const f=await accountFactory();
  await assert.rejects(()=>f.deploy(ethers.ZeroAddress,ethers.ZeroAddress,bridge.target),/InvalidAddress/);
 });
 it("rejects an EOA as the smart-account bridge",async()=>{
  const f=await accountFactory();
  await assert.rejects(()=>f.deploy(owner.address,ethers.ZeroAddress,other.address),/InvalidAddress/);
 });
 it("rejects a zero smart-account bridge",async()=>{
  const f=await accountFactory();
  await assert.rejects(()=>f.deploy(owner.address,ethers.ZeroAddress,ethers.ZeroAddress),/InvalidAddress/);
 });
 it("preserves constructor dependencies and initial account state",async()=>{
  const f=await accountFactory();
  const account=await f.deploy(owner.address,other.address,bridge.target);
  await account.waitForDeployment();
  assert.equal(await account.owner(),owner.address);
  assert.equal(await account.entryPoint(),other.address);
  assert.equal(await account.authorizationBridge(),bridge.target);
  assert.equal(await account.pendingOwner(),ethers.ZeroAddress);
  assert.equal(await account.nonce(),0n);
  assert.equal(await bridge.dualProofVerifier(),verifier.target);
  assert.equal(await bridge.checkpointRegistry(),registry.target);
 });
});
