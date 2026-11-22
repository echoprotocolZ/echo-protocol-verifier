"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
const {proveAuthorizedCall}=require("./helpers/echo-real-dual-proof");
describe("Echo V4 security: proof-bound geographic policy tampering",function(){
 this.timeout(240000);
 async function deploy(n,...a){const c=await(await ethers.getContractFactory(n)).deploy(...a);await c.waitForDeployment();return c;}
 it("rejects outsider, altered zone, altered action and replay without state consumption",async function(){
 const [owner,validator,delegatee,outsider]=await ethers.getSigners();
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
 const data=await account.geographicPolicyIntent(delegatee.address,zone,true);
 const p=await proveAuthorizedCall({account:account.target,delegatee:account.target,validator,registry:registry.target,target:account.target,data,nonce:await account.nonce(),zone});
 const b={v3A:p.v3A,v3B:p.v3B,v3C:p.v3C,v3Signals:p.v3Signals,v4A:p.v4A,v4B:p.v4B,v4C:p.v4C,v4Signals:p.v4Signals};
 const digest=await registry.checkpointDigest(p.checkpoint);
 async function attempt(signer,z,enabled){const tx=await account.connect(signer).authorizeGeographicPolicyWithProof(p.checkpoint,p.signature,b,delegatee.address,z,enabled);await tx.wait();}
 await assert.rejects(()=>attempt(outsider,zone,true));
 assert.equal(await account.nonce(),0n);
 assert.equal(await registry.consumedCheckpoints(digest),false);
 const altered={...zone,maxLat:zone.maxLat+1};
 await assert.rejects(()=>attempt(owner,altered,true));
 await assert.rejects(()=>attempt(owner,zone,false));
 assert.equal(await account.nonce(),0n);
 assert.equal(await bridge.consumedNullifiers(p.nullifier),false);
 assert.equal((await policy.getGeographicPolicy(account.target,delegatee.address)).enabled,false);
 await attempt(owner,zone,true);
 assert.equal(await account.nonce(),1n);
 assert.equal((await policy.getGeographicPolicy(account.target,delegatee.address)).enabled,true);
 assert.equal((await registry.attestationPolicies(account.target,delegatee.address)).enabled,true);
 assert.equal(await registry.consumedCheckpoints(digest),true);
 await assert.rejects(()=>attempt(owner,zone,true));
 assert.equal(await account.nonce(),1n);
 });
});
