const assert=require("node:assert/strict");
const {ethers}=require("hardhat");

// Isolated checkpoint registry fixture tests. This mock does NOT authenticate
// signatures or prove real V4 dual-proof authorization correctness.
describe("Echo replay checkpoint fixture — consumption and rollback",function(){
 let registry,owner,other;
 const cp=account=>({
   account,delegatee:account,zoneHash:ethers.ZeroHash,
   checkpointCommitment:ethers.ZeroHash,authorizationCommitment:ethers.ZeroHash,
   timestamp:1000,nonce:7
 });
 beforeEach(async function(){
   [owner,other]=await ethers.getSigners();
   registry=await(await ethers.getContractFactory("EchoReplayRegistryMock")).deploy();
   await registry.waitForDeployment();
 });
 function key(checkpoint,signature){
   const coder=ethers.AbiCoder.defaultAbiCoder();
   const type="tuple(address account,address delegatee,bytes32 zoneHash,bytes32 checkpointCommitment,bytes32 authorizationCommitment,uint64 timestamp,uint256 nonce)";
   return ethers.keccak256(coder.encode([type,"bytes"],[checkpoint,signature]));
 }
 it("rejects reuse of the same checkpoint and signature",async function(){
   const c=cp(owner.address),sig="0x1234",k=key(c,sig);
   await(await registry.consumeCheckpointFromBridge(c,sig)).wait();
   assert.equal(await registry.consumed(k),true);
   await assert.rejects(async()=>{await(await registry.consumeCheckpointFromBridge(c,sig)).wait();});
 });
 it("does not consume checkpoint when registry rejects it",async function(){
   const c=cp(owner.address),sig="0x1234",k=key(c,sig);
   await(await registry.setFailConsumption(true)).wait();
   await assert.rejects(async()=>{await(await registry.consumeCheckpointFromBridge(c,sig)).wait();});
   assert.equal(await registry.consumed(k),false);
 });
 it("tracks checkpoints separately for distinct accounts",async function(){
   const a=cp(owner.address),b=cp(other.address),sig="0x1234";
   await(await registry.consumeCheckpointFromBridge(a,sig)).wait();
   assert.equal(await registry.consumed(key(a,sig)),true);
   assert.equal(await registry.consumed(key(b,sig)),false);
 });
});
