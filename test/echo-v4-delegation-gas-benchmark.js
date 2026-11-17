"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
const {proveAuthorizedCall}=require("./helpers/echo-real-dual-proof");
describe("Echo delegation real-proof gas benchmark",function(){
 this.timeout(240000);
 async function deploy(n,...a){const c=await(await ethers.getContractFactory(n)).deploy(...a);await c.waitForDeployment();return c;}
 it("measures approval and revocation transaction gas",async function(){
 const [owner,validator,delegatee]=await ethers.getSigners();
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
 for(const authorized of [true,false]){
  const nonce=await account.nonce();
  const data=await account.delegationIntent(delegatee.address,authorized);
  const p=await proveAuthorizedCall({account:account.target,delegatee:account.target,validator,registry:registry.target,target:account.target,data,value:0n,nonce,zone});
  const proof={v3A:p.v3A,v3B:p.v3B,v3C:p.v3C,v3Signals:p.v3Signals,v4A:p.v4A,v4B:p.v4B,v4C:p.v4C,v4Signals:p.v4Signals};
  const receipt=await(await account.authorizeDelegateeWithProof(p.checkpoint,p.signature,proof,delegatee.address,authorized)).wait();
  assert.equal(receipt.status,1);
  assert.equal(await account.nonce(),nonce+1n);
  assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),authorized);
  console.log("ECHO GAS "+(authorized?"APPROVE":"REVOKE")+": "+receipt.gasUsed.toString());
 }
 });
});
