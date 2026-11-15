"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
describe("Echo V4 ownership intent encoding integrity",function(){
 let owner,alice,bob,account;
 beforeEach(async()=>{
  [owner,alice,bob]=await ethers.getSigners();
  const registry=await(await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
  const verifier=await(await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
  const bridge=await(await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(verifier.target,registry.target);
  account=await(await ethers.getContractFactory("EchoSmartAccountV4")).deploy(owner.address,ethers.ZeroAddress,bridge.target);
 });
 const decode=async(successor,deadline)=>ethers.AbiCoder.defaultAbiCoder().decode(
  ["bytes32","address","address","uint256","uint256","uint256"],
  await account.ownershipProposalIntent(successor,deadline)
 );
 const domain=ethers.keccak256(ethers.toUtf8Bytes("ECHO_V4_ADMIN_OWNERSHIP_PROPOSAL_V1"));
 it("encodes the expected domain separator",async()=>{
  const fields=await decode(alice.address,100);
  assert.equal(fields[0],domain);
 });
 it("encodes the smart account address",async()=>{
  const fields=await decode(alice.address,100);
  assert.equal(fields[1],account.target);
 });
 it("encodes the selected successor",async()=>{
  const fields=await decode(alice.address,100);
  assert.equal(fields[2],alice.address);
 });
 it("encodes the current chain ID",async()=>{
  const fields=await decode(alice.address,100);
  assert.equal(fields[3],(await ethers.provider.getNetwork()).chainId);
 });
 it("encodes the current account nonce",async()=>{
  const fields=await decode(alice.address,100);
  assert.equal(fields[4],await account.nonce());
 });
 it("encodes the requested deadline",async()=>{
  const fields=await decode(alice.address,100);
  assert.equal(fields[5],100n);
 });
 it("changes only the successor field when the successor changes",async()=>{
  const first=await decode(alice.address,100);
  const second=await decode(bob.address,100);
  assert.equal(first[0],second[0]);assert.equal(first[1],second[1]);
  assert.notEqual(first[2],second[2]);
  assert.equal(first[3],second[3]);assert.equal(first[4],second[4]);assert.equal(first[5],second[5]);
 });
 it("changes only the deadline field when the deadline changes",async()=>{
  const first=await decode(alice.address,100);
  const second=await decode(alice.address,101);
  for(let i=0;i<5;i++)assert.equal(first[i],second[i]);
  assert.notEqual(first[5],second[5]);
 });
 it("encodes a large uint256 deadline without truncation",async()=>{
  const deadline=(1n<<255n)+123n;
  const fields=await decode(alice.address,deadline);
  assert.equal(fields[5],deadline);
 });
 it("does not modify ownership or nonce when reading encoded intent",async()=>{
  await decode(alice.address,100);
  assert.equal(await account.owner(),owner.address);
  assert.equal(await account.pendingOwner(),ethers.ZeroAddress);
  assert.equal(await account.nonce(),0n);
 });
});
