const assert=require("node:assert/strict");
const {ethers}=require("hardhat");

describe("Echo V3 real registry — signed checkpoint replay protection",function(){
 let registry,account,validator,outsider,zone;
 const types={SignedCheckpoint:[
  {name:"account",type:"address"},{name:"delegatee",type:"address"},
  {name:"zoneHash",type:"bytes32"},{name:"checkpointCommitment",type:"bytes32"},
  {name:"authorizationCommitment",type:"bytes32"},{name:"timestamp",type:"uint64"},
  {name:"nonce",type:"uint256"}
 ]};
 async function forward(name,args){
   const data=registry.interface.encodeFunctionData(name,args);
   return account.forward(registry.target,data);
 }
 async function signed(nonce=1n,signer=validator){
   const block=await ethers.provider.getBlock("latest");
   const checkpoint={account:account.target,delegatee:account.target,zoneHash:zone,
    checkpointCommitment:ethers.id("checkpoint"),authorizationCommitment:ethers.id("authorization"),
    timestamp:BigInt(block.timestamp),nonce};
   const network=await ethers.provider.getNetwork();
   const domain={name:"EchoAttestationRegistryV3",version:"1",chainId:network.chainId,verifyingContract:registry.target};
   const signature=await signer.signTypedData(domain,types,checkpoint);
   return {checkpoint,signature};
 }
 beforeEach(async function(){
   [,validator,outsider]=await ethers.getSigners();
   registry=await(await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
   account=await(await ethers.getContractFactory("EchoV3RegistryAccountHarness")).deploy();
   await Promise.all([registry.waitForDeployment(),account.waitForDeployment()]);
   zone=ethers.id("approved-zone");
   await(await forward("setValidatorSigner",[validator.address,true])).wait();
   await(await forward("setAttestationPolicy",[account.target,{
     allowedZoneHash:zone,maxTimeDrift:3600,requiredTier:0,
     allowValidatorFallback:false,enabled:true
   }])).wait();
 });
 it("consumes a correctly signed checkpoint and blocks identical replay",async function(){
   const {checkpoint,signature}=await signed();
   const digest=await registry.checkpointDigest(checkpoint);
   await(await forward("consumeCheckpoint",[checkpoint,signature])).wait();
   assert.equal(await registry.consumedCheckpoints(digest),true);
   assert.equal(await registry.consumedCheckpointNonces(account.target,account.target,1n),true);
   await assert.rejects(async()=>{await(await forward("consumeCheckpoint",[checkpoint,signature])).wait();});
 });
 it("blocks a changed checkpoint using the same account/delegatee nonce",async function(){
   const first=await signed(5n);
   await(await forward("consumeCheckpoint",[first.checkpoint,first.signature])).wait();
   const changed=await signed(5n);
   changed.checkpoint.checkpointCommitment=ethers.id("different-checkpoint");
   const network=await ethers.provider.getNetwork();
   changed.signature=await validator.signTypedData({
     name:"EchoAttestationRegistryV3",version:"1",chainId:network.chainId,verifyingContract:registry.target
   },types,changed.checkpoint);
   const digest=await registry.checkpointDigest(changed.checkpoint);
   assert.equal(await registry.consumedCheckpoints(digest),false);
   await assert.rejects(async()=>{await(await forward("consumeCheckpoint",[changed.checkpoint,changed.signature])).wait();});
   assert.equal(await registry.consumedCheckpoints(digest),false);
 });
 it("rejects untrusted signer without consuming nonce or digest",async function(){
   const {checkpoint,signature}=await signed(8n,outsider);
   const digest=await registry.checkpointDigest(checkpoint);
   await assert.rejects(async()=>{await(await forward("consumeCheckpoint",[checkpoint,signature])).wait();});
   assert.equal(await registry.consumedCheckpoints(digest),false);
   assert.equal(await registry.consumedCheckpointNonces(account.target,account.target,8n),false);
 });
 it("rejects direct external caller impersonating the account",async function(){
   const {checkpoint,signature}=await signed(9n);
   const digest=await registry.checkpointDigest(checkpoint);
   await assert.rejects(async()=>{await(await registry.connect(outsider).consumeCheckpoint(checkpoint,signature)).wait();});
   assert.equal(await registry.consumedCheckpoints(digest),false);
   assert.equal(await registry.consumedCheckpointNonces(account.target,account.target,9n),false);
 });
});
