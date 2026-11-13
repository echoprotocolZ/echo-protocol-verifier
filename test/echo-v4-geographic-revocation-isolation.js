"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
const {proveAuthorizedCall}=require("./helpers/echo-real-dual-proof");
describe("Echo V4: geographic revocation with delegatee still authorized",function(){
 this.timeout(240000);
 async function deploy(n,...a){const c=await(await ethers.getContractFactory(n)).deploy(...a);await c.waitForDeployment();return c;}
 it("rejects a fresh real proof after geo revocation without consuming it",async function(){
 const [owner,validator,delegatee,target]=await ethers.getSigners();
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
 const bundle=p=>({v3A:p.v3A,v3B:p.v3B,v3C:p.v3C,v3Signals:p.v3Signals,v4A:p.v4A,v4B:p.v4B,v4C:p.v4C,v4Signals:p.v4Signals});
 const proof=(who,destination,data)=>proveAuthorizedCall({account:account.target,delegatee:who,validator,registry:registry.target,target:destination,data,value:0n,nonce:account.nonce(),zone});
 async function admin(data,kind,enabled){
  const p=await proof(account.target,account.target,data);
  if(kind==="delegate") await(await account.connect(owner).authorizeDelegateeWithProof(p.checkpoint,p.signature,bundle(p),delegatee.address,enabled)).wait();
  else await(await account.connect(owner).authorizeGeographicPolicyWithProof(p.checkpoint,p.signature,bundle(p),delegatee.address,zone,enabled)).wait();
 }
 await admin(await account.delegationIntent(delegatee.address,true),"delegate",true);
 await admin(await account.geographicPolicyIntent(delegatee.address,zone,true),"geo",true);
 assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),true);
 assert.equal((await policy.getGeographicPolicy(account.target,delegatee.address)).enabled,true);
 await admin(await account.geographicPolicyIntent(delegatee.address,zone,false),"geo",false);
 assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),true);
 assert.equal((await policy.getGeographicPolicy(account.target,delegatee.address)).enabled,false);
 const data="0x";
 const p=await proof(delegatee.address,target.address,data);
 const digest=await registry.checkpointDigest(p.checkpoint);
 const before=await account.nonce();
 const args=[p.checkpoint,p.signature,p.v3A,p.v3B,p.v3C,p.v3Signals,p.v4A,p.v4B,p.v4C,p.v4Signals,target.address,0n,data];
 await assert.rejects(async()=>{const tx=await account.connect(delegatee).executeAuthorized(...args);await tx.wait();});
 assert.equal(await account.nonce(),before);
 assert.equal(await bridge.consumedNullifiers(p.nullifier),false);
 assert.equal(await registry.consumedCheckpoints(digest),false);
 assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),true);
 });
});
