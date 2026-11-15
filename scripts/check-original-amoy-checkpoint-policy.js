#!/usr/bin/env node
"use strict";
// Read-only Amoy policy/signature gate. No transaction or private key access.
const fs=require("node:fs"),hre=require("hardhat");
const {loadRecords}=require("./amoy-deployment-records");
async function main(){
 if(hre.network.name!=="amoy")throw Error("Run with --network amoy");
 const {ethers}=hre;
 const urls=[process.env.AMOY_RPC_URL,"https://polygon-amoy-bor-rpc.publicnode.com","https://rpc-amoy.polygon.technology","https://polygon-amoy.drpc.org"].filter(Boolean);
 let provider=null;
 for(const url of [...new Set(urls)]){
  try{
   const candidate=new ethers.JsonRpcProvider(url,80002,{batchMaxCount:1,staticNetwork:true});
   const chain=await Promise.race([candidate.send("eth_chainId",[]),new Promise((_,reject)=>setTimeout(()=>reject(Error("RPC probe timeout")),7000))]);
   if(BigInt(chain)!==80002n)throw Error("Wrong chain");
   provider=candidate;
   console.log("RPC connected:",new URL(url).host);
   break;
  }catch(e){console.log("RPC unavailable:",new URL(url).host,e.shortMessage||e.message);}
 }
 if(!provider)throw Error("All Amoy RPC endpoints unavailable");
 const r=loadRecords().contracts,dir="build/v4-geographic-bound/proofs/";
 const signed=JSON.parse(fs.readFileSync(dir+"v4-signed-checkpoint-original-account.json","utf8"));
 const v3=JSON.parse(fs.readFileSync(dir+"v3-amoy-matching-public.json","utf8"));
 const v4=JSON.parse(fs.readFileSync(dir+"approved-zone-public.json","utf8"));
 const cp=signed.checkpoint,eq=(a,b)=>BigInt(a)===BigInt(b);
 const account=r.EchoSmartAccountV4;
 const registry=new ethers.Contract(r.EchoAttestationRegistryV3,[
  "function checkpointDigest((address account,address delegatee,bytes32 zoneHash,bytes32 checkpointCommitment,bytes32 authorizationCommitment,uint64 timestamp,uint256 nonce)) view returns (bytes32)",
  "function trustedValidatorSigners(address,address) view returns (bool)",
  "function authorizedCheckpointBridges(address,address) view returns (bool)",
  "function attestationPolicies(address,address) view returns (bytes32 allowedZoneHash,uint64 maxTimeDrift,uint8 requiredTier,bool allowValidatorFallback,bool enabled)",
  "function consumedCheckpointNonces(address,address,uint256) view returns (bool)"
 ],provider);
 const geo=new ethers.Contract(r.EchoGeographicPolicyRegistryV4,[
  "function getGeographicPolicy(address,address) view returns ((uint256 minLat,uint256 maxLat,uint256 minLon,uint256 maxLon) zone,bytes32 zoneHash,bool enabled)"
 ],provider);
 let fails=0;const check=(name,ok)=>{console.log((ok?"PASS ":"BLOCKED ")+name);if(!ok)fails++};
 const nonce=await new ethers.Contract(account,["function nonce() view returns (uint256)"],provider).nonce();
 const block=await provider.getBlock("latest");
 const digest=await registry.checkpointDigest(cp);
 const recovered=ethers.recoverAddress(digest,signed.signature);
 const policy=await registry.attestationPolicies(account,cp.delegatee);
 const gp=await geo.getGeographicPolicy(account,cp.delegatee);
 const trusted=await registry.trustedValidatorSigners(account,recovered);
 const approvedBridge=await registry.authorizedCheckpointBridges(account,r.EchoAuthorizationBridgeV4);
 const consumed=await registry.consumedCheckpointNonces(account,cp.delegatee,cp.nonce);
 console.log("Echo Protocol Z — original account Amoy read-only authorization gate");
 console.log("account="+account+" nonce="+nonce+" blockTimestamp="+block.timestamp);
 console.log("recoveredValidator="+recovered);
 check("Account binding",cp.account.toLowerCase()===account.toLowerCase()&&eq(v3[3],account));
 check("Nonce binding",eq(cp.nonce,nonce)&&eq(v3[11],nonce));
 check("Signature recovers V3 validator",eq(recovered,v3[5]));
 check("Trusted validator registered for original account",trusted);
 check("Attestation policy enabled",policy.enabled);
 check("Attestation zone hash matches checkpoint",policy.allowedZoneHash.toLowerCase()===cp.zoneHash.toLowerCase());
 check("Attestation policy validator-only tier",Number(policy.requiredTier)===0);
 check("Checkpoint timestamp within policy drift",BigInt(cp.timestamp)<=BigInt(block.timestamp)&&BigInt(block.timestamp)-BigInt(cp.timestamp)<=BigInt(policy.maxTimeDrift));
 check("Geographic policy enabled for original account",gp.enabled);
 check("Geographic zone hash matches checkpoint",gp.zoneHash.toLowerCase()===cp.zoneHash.toLowerCase());
 check("Geographic public bounds match stored policy",eq(gp.zone.minLat,v4[0])&&eq(gp.zone.maxLat,v4[1])&&eq(gp.zone.minLon,v4[2])&&eq(gp.zone.maxLon,v4[3]));
 check("Authorized V4 checkpoint bridge",approvedBridge);
 check("Checkpoint nonce unconsumed",!consumed);
 check("Proof not expired",BigInt(block.timestamp)<BigInt(v3[12]));
 check("V3/V4 checkpoint commitment",eq(v3[18],v4[4])&&eq(cp.checkpointCommitment,v3[18]));
 check("Checkpoint authorization commitment",eq(cp.authorizationCommitment,v3[1]));
 console.log("SUMMARY: "+(16-fails)+"/16 checks passed");
 console.log("READ ONLY: no transactions, signing or policy changes.");
 if(fails)process.exitCode=1;
}
main().catch(e=>{console.error("BLOCKED:",e.shortMessage||e.message);process.exitCode=1});
