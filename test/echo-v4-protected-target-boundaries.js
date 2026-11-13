"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
const {proveAuthorizedCall}=require("./helpers/echo-real-dual-proof");
describe("Echo V4: protected dependency target boundaries",function(){
 this.timeout(240000);
 async function deploy(n,...a){const c=await(await ethers.getContractFactory(n)).deploy(...a);await c.waitForDeployment();return c;}
 it("rejects proof-backed calls to account and authorization infrastructure without consumption",async function(){
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
 const forbidden=[account.target,bridge.target,registry.target,dual.target,gateway.target,policy.target];
 for(const target of forbidden){
  const p=await proveAuthorizedCall({account:account.target,delegatee:account.target,validator,registry:registry.target,target,data:"0x",nonce:await account.nonce(),zone});
  const digest=await registry.checkpointDigest(p.checkpoint);
  await assert.rejects(async()=>{
   const tx=await account.connect(owner).executeAuthorized(p.checkpoint,p.signature,p.v3A,p.v3B,p.v3C,p.v3Signals,p.v4A,p.v4B,p.v4C,p.v4Signals,target,0n,"0x");
   await tx.wait();
  },/InvalidAddress/);
  assert.equal(await account.nonce(),0n);
  assert.equal(await registry.consumedCheckpoints(digest),false);
  assert.equal(await bridge.consumedNullifiers(p.nullifier),false);
 }
 });
});
