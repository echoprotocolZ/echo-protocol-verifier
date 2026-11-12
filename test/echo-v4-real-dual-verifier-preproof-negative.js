const assert=require("node:assert/strict");
const {ethers}=require("hardhat");

// REAL EchoDualProofVerifierV4 and REAL geographic-zone validation.
// Dependency stubs are only used to satisfy constructor code requirements.
// These negative tests revert BEFORE any Groth16 dependency call.
describe("Echo V4 real dual verifier — pre-proof rejection boundaries",function(){
 let verifier,account,delegatee;
 const a=[0n,0n],b=[[0n,0n],[0n,0n]],c=[0n,0n];
 async function expectRejected(cp,v3,v4){
  await assert.rejects(async()=>verifier.verifyDualProof(cp,a,b,c,v3,a,b,c,v4));
 }
 beforeEach(async function(){
  [account,delegatee]=await ethers.getSigners();
  const f=await ethers.getContractFactory("EchoBridgeDependencyStub");
  const v3=await f.deploy();await v3.waitForDeployment();
  const gateway=await f.deploy();await gateway.waitForDeployment();
  verifier=await(await ethers.getContractFactory("EchoDualProofVerifierV4")).deploy(v3.target,gateway.target);
  await verifier.waitForDeployment();
 });
 function fixture(){
  const commitment=ethers.id("real-dual-negative-checkpoint");
  const cp={account:account.address,delegatee:delegatee.address,zoneHash:ethers.id("zone"),
   checkpointCommitment:commitment,authorizationCommitment:ethers.id("auth"),timestamp:1n,nonce:0n};
  const v3=Array(20).fill(0n);v3[18]=BigInt(commitment);
  const v4=[0n,0n,0n,0n,BigInt(commitment)];
  return {cp,v3,v4};
 }
 it("rejects V3 checkpoint commitment mismatch before proof verification",async function(){
  const {cp,v3,v4}=fixture();v3[18]+=1n;
  await expectRejected(cp,v3,v4);
 });
 it("rejects V4 checkpoint commitment mismatch before proof verification",async function(){
  const {cp,v3,v4}=fixture();v4[4]+=1n;
  await expectRejected(cp,v3,v4);
 });
 it("rejects geographic latitude exceeding protocol limit",async function(){
  const {cp,v3,v4}=fixture();v4[1]=1800000001n;
  await expectRejected(cp,v3,v4);
 });
 it("rejects geographic longitude exceeding protocol limit",async function(){
  const {cp,v3,v4}=fixture();v4[3]=3600000001n;
  await expectRejected(cp,v3,v4);
 });
 it("rejects reversed latitude boundaries in real zone library",async function(){
  const {cp,v3,v4}=fixture();v4[0]=2n;v4[1]=1n;
  await expectRejected(cp,v3,v4);
 });
 it("rejects reversed longitude boundaries in real zone library",async function(){
  const {cp,v3,v4}=fixture();v4[2]=2n;v4[3]=1n;
  await expectRejected(cp,v3,v4);
 });
});
