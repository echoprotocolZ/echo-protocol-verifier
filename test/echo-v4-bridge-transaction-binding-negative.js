const assert=require("node:assert/strict");
const {ethers}=require("hardhat");

// Negative-path transaction binding checks on the actual V4 bridge.
// These inputs intentionally do NOT contain valid proofs or signatures;
// they must be rejected before proof verification or checkpoint consumption.
describe("Echo V4 bridge — transaction binding and replay rejection",function(){
 let bridge,account,recipient;
 const z2=[0n,0n],zb=[[0n,0n],[0n,0n]],z5=Array(5).fill(0n);
 async function deploy(name,...args){const c=await(await ethers.getContractFactory(name)).deploy(...args);await c.waitForDeployment();return c;}
 function makeCheckpoint(){
   return {account:account.target,delegatee:account.target,
    zoneHash:ethers.ZeroHash,checkpointCommitment:ethers.ZeroHash,
    authorizationCommitment:ethers.ZeroHash,timestamp:1000,nonce:7};
 }
 async function makeInputs(){
   const cp=makeCheckpoint(), signals=Array(20).fill(0n);
   const chainId=(await ethers.provider.getNetwork()).chainId;
   const timestamp=BigInt((await ethers.provider.getBlock("latest")).timestamp);
   const target=recipient.address,value=12n,callData="0x12345678",nonce=7n;
   const hash=BigInt(ethers.keccak256(callData));
   signals[3]=BigInt(account.target);signals[4]=BigInt(account.target);
   signals[6]=BigInt(target);signals[7]=value;
   signals[8]=hash&((1n<<128n)-1n);signals[9]=hash>>128n;
   signals[10]=chainId;signals[11]=nonce;signals[12]=timestamp+3600n;
   signals[16]=1000n;signals[17]=1000n;signals[19]=1000n;
   return {cp,signals,target,value,callData,nonce};
 }
 function payload(x){
   return bridge.interface.encodeFunctionData("authorize",[
     x.cp,"0x",z2,zb,z2,x.signals,z2,zb,z2,z5,
     x.target,x.value,x.callData,x.nonce
   ]);
 }
 async function rejectedAs(x,expected){
   const [ok,reason]=await account.callBridge.staticCall(bridge.target,payload(x));
   assert.equal(ok,false,"authorization unexpectedly succeeded");
   const decoded=bridge.interface.parseError(reason);
   assert.ok(decoded,"revert data was not a recognized bridge error");
   assert.equal(decoded.name,expected);
   assert.equal(await bridge.consumedNullifiers(0n),false);
 }
 beforeEach(async function(){
   const signers=await ethers.getSigners();
   recipient=signers[2];
   const dependency=await deploy("EchoBridgeDependencyStub");
   bridge=await deploy("EchoAuthorizationBridgeV4",dependency.target,dependency.target);
   account=await deploy("EchoBridgeCallerHarness");
 });
 it("rejects altered target address",async function(){
   const x=await makeInputs();x.target=(await ethers.getSigners())[3].address;
   await rejectedAs(x,"InvalidTransaction");
 });
 it("rejects altered ETH value",async function(){
   const x=await makeInputs();x.value=13n;
   await rejectedAs(x,"InvalidTransaction");
 });
 it("rejects altered calldata",async function(){
   const x=await makeInputs();x.callData="0x12345679";
   await rejectedAs(x,"InvalidTransaction");
 });
 it("rejects altered nonce",async function(){
   const x=await makeInputs();x.nonce=8n;
   await rejectedAs(x,"InvalidNonce");
 });
 it("rejects incorrect chain ID",async function(){
   const x=await makeInputs();x.signals[10]+=1n;
   await rejectedAs(x,"InvalidChain");
 });
 it("rejects expired transaction authorization",async function(){
   const x=await makeInputs();x.signals[12]=0n;
   await rejectedAs(x,"ExpiredAuthorization");
 });
 it("rejects checkpoint nonce mismatch before transaction checks",async function(){
   const x=await makeInputs();x.cp.nonce=8;
   await rejectedAs(x,"CheckpointBindingMismatch");
 });
 it("rejects checkpoint timestamp outside proof bounds",async function(){
   const x=await makeInputs();x.cp.timestamp=1001;
   await rejectedAs(x,"CheckpointBindingMismatch");
 });
});
