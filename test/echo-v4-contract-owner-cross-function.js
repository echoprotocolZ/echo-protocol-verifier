"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
const {proveAuthorizedCall}=require("./helpers/echo-real-dual-proof");
describe("Echo V4: contract-owner cross-function reentrancy",function(){
 this.timeout(240000);
 async function deploy(n,...a){const c=await(await ethers.getContractFactory(n)).deploy(...a);await c.waitForDeployment();return c;}
 it("blocks proof-admin callback from contract owner while executing",async function(){
  const [deployer,validator,delegatee]=await ethers.getSigners();
  const registry=await deploy("EchoAttestationRegistryV3");
  const v3=await deploy("EchoAuthorizationVerifierV3");
  const v3bridge=await deploy("EchoAuthorizationBridgeV3",v3.target,registry.target);
  const policy=await deploy("EchoGeographicPolicyRegistryV4");
  const v4=await deploy("EchoGeographicBoundVerifierV4");
  const gateway=await deploy("EchoGeographicProofGatewayV4",v4.target,policy.target);
  const dual=await deploy("EchoDualProofVerifierV4",v3bridge.target,gateway.target);
  const bridge=await deploy("EchoAuthorizationBridgeV4",dual.target,registry.target);
  const zone={minLat:100050,maxLat:100050,minLon:200000,maxLon:200000};
  const ownerContract=await deploy("EchoContractOwnerCallbackProbe");
  const account=await deploy("EchoSmartAccountV4DelegationCandidate",ownerContract.target,ethers.ZeroAddress,bridge.target,validator.address,zone,3600n);
  const domain=await account.DELEGATION_DOMAIN();
  const chain=(await ethers.provider.getNetwork()).chainId;
  const adminData=ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32","uint256","address","address","bool","uint256"],
    [domain,chain,account.target,delegatee.address,true,1n]);
  const admin=await proveAuthorizedCall({account:account.target,delegatee:account.target,validator,registry:registry.target,target:account.target,data:adminData,nonce:1n,zone});
  const bundle={v3A:admin.v3A,v3B:admin.v3B,v3C:admin.v3C,v3Signals:admin.v3Signals,v4A:admin.v4A,v4B:admin.v4B,v4C:admin.v4C,v4Signals:admin.v4Signals};
  const adminPayload=account.interface.encodeFunctionData("authorizeDelegateeWithProof",
    [admin.checkpoint,admin.signature,bundle,delegatee.address,true]);
  await(await ownerContract.configure(account.target,adminPayload)).wait();
  const callData=ownerContract.interface.encodeFunctionData("callback");
  const outer=await proveAuthorizedCall({account:account.target,delegatee:account.target,validator,registry:registry.target,target:ownerContract.target,data:callData,nonce:0n,zone});
  const executePayload=account.interface.encodeFunctionData("executeAuthorized",[
    outer.checkpoint,outer.signature,outer.v3A,outer.v3B,outer.v3C,outer.v3Signals,
    outer.v4A,outer.v4B,outer.v4C,outer.v4Signals,ownerContract.target,0n,callData]);
  await(await ownerContract.connect(deployer).run(executePayload)).wait();
  assert.equal(await ownerContract.callbackAttempted(),true);
  assert.equal(await ownerContract.callbackSucceeded(),false,"contract owner reentered proof administration");
  assert.equal(await account.nonce(),1n);
  assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),false);
  assert.equal(await bridge.consumedNullifiers(admin.nullifier),false);
 });
});
