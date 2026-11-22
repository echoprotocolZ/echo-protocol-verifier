const assert=require("node:assert/strict");
const {ethers}=require("hardhat");

// Real V3 registry + real V4 bridge; proof verifier is ALWAYS TRUE.
// This is an authorization state-machine test, NOT Groth16 proof validation.
describe("Echo V3/V4 bridge — signed checkpoint consumption and rollback (mock proofs)",function(){
 let registry,bridge,account,validator,recipient,zone;
 const z2=[0n,0n],zb=[[0n,0n],[0n,0n]],z5=Array(5).fill(0n);
 const types={SignedCheckpoint:[
  {name:"account",type:"address"},{name:"delegatee",type:"address"},
  {name:"zoneHash",type:"bytes32"},{name:"checkpointCommitment",type:"bytes32"},
  {name:"authorizationCommitment",type:"bytes32"},{name:"timestamp",type:"uint64"},
  {name:"nonce",type:"uint256"}
 ]};
 async function deploy(name,...args){const c=await(await ethers.getContractFactory(name)).deploy(...args);await c.waitForDeployment();return c;}
 async function forward(name,args){return account.forward(registry.target,registry.interface.encodeFunctionData(name,args));}
 async function setupInput(nullifier=33n,nonce=0n){
  const now=BigInt((await ethers.provider.getBlock("latest")).timestamp);
  const chain=(await ethers.provider.getNetwork()).chainId;
  const data="0x12345678",hash=BigInt(ethers.keccak256(data));
  const cp={account:account.target,delegatee:account.target,zoneHash:zone,
   checkpointCommitment:ethers.id("v4-test-checkpoint-"+nonce),authorizationCommitment:ethers.id("v4-test-auth-"+nonce),
   timestamp:now,nonce};
  const sig=await validator.signTypedData({
   name:"EchoAttestationRegistryV3",version:"1",chainId:chain,verifyingContract:registry.target
  },types,cp);
  const s=Array(20).fill(0n);
  s[1]=BigInt(cp.authorizationCommitment);s[2]=nullifier;s[3]=BigInt(account.target);
  s[4]=BigInt(account.target);s[5]=BigInt(validator.address);
  s[6]=BigInt(recipient.address);s[7]=0n;
  s[8]=hash&((1n<<128n)-1n);s[9]=hash>>128n;s[10]=chain;
  s[11]=nonce;s[12]=now+3600n;s[16]=now;s[17]=now;s[18]=BigInt(cp.checkpointCommitment);s[19]=now;
  const payload=bridge.interface.encodeFunctionData("authorize",[
   cp,sig,z2,zb,z2,s,z2,zb,z2,z5,recipient.address,0n,data,nonce
  ]);
  return {cp,sig,s,payload,digest:await registry.checkpointDigest(cp)};
 }
 async function call(payload){return account.forward(bridge.target,payload);}
 beforeEach(async function(){
  [,validator,recipient]=await ethers.getSigners();
  registry=await deploy("EchoAttestationRegistryV3");
  account=await deploy("EchoV3RegistryAccountHarness");
  const mock=await deploy("EchoAlwaysTrueDualProofTestMock");
  bridge=await deploy("EchoAuthorizationBridgeV4",mock.target,registry.target);
  zone=ethers.id("bridge-replay-zone");
  await(await forward("setValidatorSigner",[validator.address,true])).wait();
  await(await forward("setAttestationPolicy",[account.target,{
   allowedZoneHash:zone,maxTimeDrift:3600,requiredTier:0,
   allowValidatorFallback:false,enabled:true
  }])).wait();
  await(await forward("setCheckpointBridge",[bridge.target,true])).wait();
 });
 it("consumes a valid signed checkpoint and nonzero nullifier exactly once",async function(){
  const x=await setupInput();
  await(await call(x.payload)).wait();
  assert.equal(await registry.consumedCheckpoints(x.digest),true);
  assert.equal(await registry.consumedCheckpointNonces(account.target,account.target,0n),true);
  assert.equal(await bridge.consumedNullifiers(33n),true);
  await assert.rejects(async()=>{await(await call(x.payload)).wait();});
 });
 it("rolls back bridge nullifier and registry checkpoint when nullifier is zero",async function(){
  const x=await setupInput(0n);
  await assert.rejects(async()=>{await(await call(x.payload)).wait();});
  assert.equal(await registry.consumedCheckpoints(x.digest),false);
  assert.equal(await registry.consumedCheckpointNonces(account.target,account.target,0n),false);
  assert.equal(await bridge.consumedNullifiers(0n),false);
 });
 it("does not consume state when checkpoint bridge permission is revoked",async function(){
  const x=await setupInput();
  await(await forward("setCheckpointBridge",[bridge.target,false])).wait();
  await assert.rejects(async()=>{await(await call(x.payload)).wait();});
  assert.equal(await registry.consumedCheckpoints(x.digest),false);
  assert.equal(await bridge.consumedNullifiers(33n),false);
 });
 it("rejects reused nullifier across distinct signed checkpoints and rolls back second checkpoint",async function(){
  const first=await setupInput(44n,0n);
  await(await call(first.payload)).wait();
  const second=await setupInput(44n,1n);
  assert.notEqual(first.digest,second.digest);
  assert.equal(await registry.consumedCheckpoints(second.digest),false);
  await assert.rejects(async()=>{await(await call(second.payload)).wait();});
  assert.equal(await registry.consumedCheckpoints(first.digest),true);
  assert.equal(await registry.consumedCheckpoints(second.digest),false);
  assert.equal(await registry.consumedCheckpointNonces(account.target,account.target,1n),false);
  assert.equal(await bridge.consumedNullifiers(44n),true);
 });
 it("allows a fresh signed checkpoint and distinct nullifier after prior consumption",async function(){
  const first=await setupInput(51n,0n);
  await(await call(first.payload)).wait();
  const second=await setupInput(52n,1n);
  await(await call(second.payload)).wait();
  assert.equal(await registry.consumedCheckpoints(first.digest),true);
  assert.equal(await registry.consumedCheckpoints(second.digest),true);
  assert.equal(await registry.consumedCheckpointNonces(account.target,account.target,1n),true);
  assert.equal(await bridge.consumedNullifiers(51n),true);
  assert.equal(await bridge.consumedNullifiers(52n),true);
 });
});
