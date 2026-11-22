"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
const {proveAuthorizedCall}=require("./helpers/echo-real-dual-proof");
describe("Echo V4 atomic rollback on failed target",function(){
 this.timeout(240000);
 async function deploy(n,...args){const c=await(await ethers.getContractFactory(n)).deploy(...args);await c.waitForDeployment();return c;}
 it("reverts checkpoint, nullifier and nonce when target reverts; proof remains usable",async function(){
 const [owner,validator]=await ethers.getSigners();
 const registry=await deploy("EchoAttestationRegistryV3");
 const v3=await deploy("EchoAuthorizationVerifierV3");
 const v3bridge=await deploy("EchoAuthorizationBridgeV3",v3.target,registry.target);
 const policy=await deploy("EchoGeographicPolicyRegistryV4");
 const v4=await deploy("EchoGeographicBoundVerifierV4");
 const gateway=await deploy("EchoGeographicProofGatewayV4",v4.target,policy.target);
 const dual=await deploy("EchoDualProofVerifierV4",v3bridge.target,gateway.target);
 const bridge=await deploy("EchoAuthorizationBridgeV4",dual.target,registry.target);
 const zone={minLat:100050,maxLat:100050,minLon:200000,maxLon:200000};
 const account=await deploy("EchoSmartAccountV4DelegationCandidate",owner.address,ethers.ZeroAddress,bridge.target,validator.address,zone,3600n);
 const target=await deploy("EchoAlwaysRevert");
 const data=target.interface.encodeFunctionData("fail");
 const p=await proveAuthorizedCall({account:account.target,delegatee:account.target,validator,registry:registry.target,target:target.target,data,nonce:0n,zone});
 const args=[p.checkpoint,p.signature,p.v3A,p.v3B,p.v3C,p.v3Signals,p.v4A,p.v4B,p.v4C,p.v4Signals,target.target,0n,data];
 const digest=await registry.checkpointDigest(p.checkpoint);
 for(let i=0;i<2;i++){
  await assert.rejects(async()=>{const tx=await account.connect(owner).executeAuthorized(...args);await tx.wait();});
  assert.equal(await account.nonce(),0n);
  assert.equal(await registry.consumedCheckpoints(digest),false);
  assert.equal(await bridge.consumedNullifiers(p.nullifier),false);
 }
 });
});
