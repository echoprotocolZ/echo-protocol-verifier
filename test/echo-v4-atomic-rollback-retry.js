"use strict";
const assert=require("node:assert/strict");
const {ethers}=require("hardhat");
const {proveAuthorizedCall}=require("./helpers/echo-real-dual-proof");
describe("Echo V4: atomic rollback after external target failure",function(){
 this.timeout(240000);
 async function deploy(n,...args){const c=await(await ethers.getContractFactory(n)).deploy(...args);await c.waitForDeployment();return c;}
 it("does not burn a valid proof when the destination reverts, and permits retry",async function(){
  const [owner,validator,outsider]=await ethers.getSigners();
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
  const probe=await deploy("EchoReentryProbe");
  // An EOA returns success to low-level call; probe.trigger then deliberately reverts.
  await(await probe.configure(outsider.address,"0x")).wait();
  const data=probe.interface.encodeFunctionData("trigger");
  const p=await proveAuthorizedCall({account:account.target,delegatee:account.target,validator,registry:registry.target,target:probe.target,data,nonce:0n,zone});
  const args=[p.checkpoint,p.signature,p.v3A,p.v3B,p.v3C,p.v3Signals,p.v4A,p.v4B,p.v4C,p.v4Signals,probe.target,0n,data];
  const digest=await registry.checkpointDigest(p.checkpoint);
  await assert.rejects(async()=>{const tx=await account.connect(owner).executeAuthorized(...args);await tx.wait();});
  assert.equal(await account.nonce(),0n);
  assert.equal(await registry.consumedCheckpoints(digest),false);
  assert.equal(await bridge.consumedNullifiers(p.nullifier),false);
  assert.equal(await probe.attempted(),false);
  // Same proof must remain usable after the target is repaired.
  const nested=account.interface.encodeFunctionData("executeAuthorized",args);
  await(await probe.configure(account.target,nested)).wait();
  await(await account.connect(owner).executeAuthorized(...args)).wait();
  assert.equal(await probe.attempted(),true);
  assert.equal(await probe.blocked(),true);
  assert.equal(await account.nonce(),1n);
  assert.equal(await registry.consumedCheckpoints(digest),true);
  assert.equal(await bridge.consumedNullifiers(p.nullifier),true);
  await assert.rejects(async()=>{const tx=await account.connect(owner).executeAuthorized(...args);await tx.wait();});
 });
});
