#!/usr/bin/env node
"use strict";
// Deploy hardened account only on an ephemeral Hardhat fork of Polygon Amoy.
// Verify real bridge dependency wiring and administration lockdown.
// Does not register policies, generate proofs, or broadcast live transactions.
const assert=require("node:assert/strict");
const hre=require("hardhat");
const {loadRecords}=require("./amoy-deployment-records");
async function main(){
 if(hre.network.name!=="hardhat")throw Error("LOCAL FORK ONLY: use --network hardhat");
 const {ethers,network}=hre;
 const r=loadRecords().contracts;
 if(!r.EchoAuthorizationBridgeV4||!r.EchoAttestationRegistryV3||!r.EchoDualProofVerifierV4)
  throw Error("Missing Amoy V4 deployment addresses");
 const url=process.env.AMOY_RPC_URL||"https://polygon-amoy-bor-rpc.publicnode.com";
 await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:url}}]});
 const chain=await ethers.provider.getNetwork();
 // Hardhat fork may report chainId 31337, but underlying code is from Amoy.
 for(const name of ["EchoAuthorizationBridgeV4","EchoAttestationRegistryV3","EchoDualProofVerifierV4"]){
  assert.notEqual(await ethers.provider.getCode(r[name]),"0x","Missing forked "+name);
  console.log("PASS forked dependency",name,r[name]);
 }
 const bridge=new ethers.Contract(r.EchoAuthorizationBridgeV4,[
  "function checkpointRegistry() view returns(address)",
  "function dualProofVerifier() view returns(address)"
 ],ethers.provider);
 const registry=await bridge.checkpointRegistry(),verifier=await bridge.dualProofVerifier();
 assert.equal(registry.toLowerCase(),r.EchoAttestationRegistryV3.toLowerCase(),"Bridge registry mismatch");
 assert.equal(verifier.toLowerCase(),r.EchoDualProofVerifierV4.toLowerCase(),"Bridge verifier mismatch");
 console.log("PASS real Amoy bridge registry and verifier connections");
 const [owner,outsider]=await ethers.getSigners();
 const account=await (await ethers.getContractFactory("EchoSmartAccountV4")).deploy(owner.address,ethers.ZeroAddress,r.EchoAuthorizationBridgeV4);
 await account.waitForDeployment();
 const address=await account.getAddress();
 assert.equal(await account.owner(),owner.address);
 assert.equal(await account.pendingOwner(),ethers.ZeroAddress);
 assert.equal(await account.entryPoint(),ethers.ZeroAddress);
 assert.equal(await account.nonce(),0n);
 assert.equal((await account.authorizationBridge()).toLowerCase(),r.EchoAuthorizationBridgeV4.toLowerCase());
 console.log("PASS hardened replacement deployed on disposable fork:",address);
 const attempts=[
  ["owner ownership transfer",()=>account.connect(owner).transferOwnership(outsider.address)],
  ["outsider ownership transfer",()=>account.connect(outsider).transferOwnership(outsider.address)],
  ["ownership acceptance",()=>account.connect(owner).acceptOwnership()],
  ["entryPoint change",()=>account.connect(owner).setEntryPoint(outsider.address)],
  ["general administration",()=>account.connect(owner).executeAdministration(outsider.address,"0x")],
  ["geographic administration",()=>account.connect(owner).executeGeographicAdministration("0x")]
 ];
 for(const [name,attempt] of attempts){
  let rejected=false;
  try{await attempt()}catch(e){
   if(e.code==="CALL_EXCEPTION"||/revert|Unauthorized/i.test(e.shortMessage||e.message||""))rejected=true;
   else throw e;
  }
  assert.ok(rejected,"CRITICAL: "+name+" accepted");
  console.log("PASS",name,"rejected");
 }
 assert.equal(await account.owner(),owner.address);
 assert.equal(await account.pendingOwner(),ethers.ZeroAddress);
 assert.equal(await account.entryPoint(),ethers.ZeroAddress);
 assert.equal(await account.nonce(),0n);
 console.log("PASS replacement administration state unchanged");
 console.log("HARDENED REPLACEMENT AMOY-FORK WIRING PREFLIGHT PASSED");
 console.log("NOT YET VERIFIED: registry policy, fresh proof-backed execution, nonce/nullifier consumption.");
 console.log("Live deployment: NO; live POL spent: 0; local fork chain:",chain.chainId.toString());
}
main().catch(e=>{console.error("BLOCKED:",e.message);process.exitCode=1});
