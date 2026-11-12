const assert=require("node:assert/strict");
const {ethers}=require("hardhat");

describe("Echo V4 bridge — cross-contract authorization boundaries",function(){
 let owner,outsider,delegatee,bridge,account,otherAccount;
 const zero2=[0n,0n],zeroB=[[0n,0n],[0n,0n]],signals20=Array(20).fill(0n),signals5=Array(5).fill(0n);
 async function deploy(name,...args){const c=await(await ethers.getContractFactory(name)).deploy(...args);await c.waitForDeployment();return c;}
 function checkpoint(accountAddress,delegateeAddress){
   return {account:accountAddress,delegatee:delegateeAddress,zoneHash:ethers.ZeroHash,
    checkpointCommitment:ethers.ZeroHash,authorizationCommitment:ethers.ZeroHash,timestamp:0,nonce:0};
 }
 function payload(cp){
   return bridge.interface.encodeFunctionData("authorize",[
     cp,"0x",zero2,zeroB,zero2,signals20,zero2,zeroB,zero2,signals5,
     outsider.address,0n,"0x",0n
   ]);
 }
 beforeEach(async function(){
   [owner,outsider,delegatee]=await ethers.getSigners();
   const dependency=await deploy("EchoBridgeDependencyStub");
   bridge=await deploy("EchoAuthorizationBridgeV4",dependency.target,dependency.target);
   account=await deploy("EchoBridgeCallerHarness");
   otherAccount=await deploy("EchoBridgeCallerHarness");
 });
 it("rejects direct calls pretending to be another account",async function(){
   const cp=checkpoint(account.target,account.target);
   await assert.rejects(async()=>{await(await owner.sendTransaction({to:bridge.target,data:payload(cp)})).wait();});
   assert.equal(await bridge.consumedNullifiers(0n),false);
 });
 it("rejects a contract caller impersonating a different account",async function(){
   const cp=checkpoint(otherAccount.target,otherAccount.target);
   const [ok]=await account.callBridge.staticCall(bridge.target,payload(cp));
   assert.equal(ok,false);
 });
 it("rejects unapproved delegatees before proof verification",async function(){
   const cp=checkpoint(account.target,delegatee.address);
   const [ok,reason]=await account.callBridge.staticCall(bridge.target,payload(cp));
   assert.equal(ok,false);
   const error=bridge.interface.parseError(reason);
   assert.equal(error.name,"UnauthorizedDelegatee");
 });
 it("keeps delegatee approvals scoped to the authorizing account",async function(){
   await(await account.setDelegatee(bridge.target,delegatee.address,true)).wait();
   assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),true);
   assert.equal(await bridge.authorizedDelegatees(otherAccount.target,delegatee.address),false);
   const cp=checkpoint(otherAccount.target,delegatee.address);
   const [ok,reason]=await otherAccount.callBridge.staticCall(bridge.target,payload(cp));
   assert.equal(ok,false);
   assert.equal(bridge.interface.parseError(reason).name,"UnauthorizedDelegatee");
 });
 it("revoked delegatees cannot authorize through their former account",async function(){
   await(await account.setDelegatee(bridge.target,delegatee.address,true)).wait();
   await(await account.setDelegatee(bridge.target,delegatee.address,false)).wait();
   assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),false);
   const [ok,reason]=await account.callBridge.staticCall(bridge.target,payload(checkpoint(account.target,delegatee.address)));
   assert.equal(ok,false);
   assert.equal(bridge.interface.parseError(reason).name,"UnauthorizedDelegatee");
 });
 it("rejects invalid checkpoint bindings even for account-self delegatee",async function(){
   const cp=checkpoint(account.target,account.target);
   const [ok,reason]=await account.callBridge.staticCall(bridge.target,payload(cp));
   assert.equal(ok,false);
   assert.equal(bridge.interface.parseError(reason).name,"CheckpointBindingMismatch");
 });
});
