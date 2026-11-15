#!/usr/bin/env node
"use strict";
// Read-only eth_call simulation of original EchoSmartAccountV4.executeAuthorized.
// Does not send transactions or alter nonce/checkpoint/nullifier state.
const fs=require("node:fs"),path=require("node:path"),hre=require("hardhat"),snarkjs=require("snarkjs");
const {loadRecords}=require("./amoy-deployment-records");
async function main(){
 if(hre.network.name!=="amoy")throw Error("Use --network amoy");
 const {ethers}=hre,dir="build/v4-geographic-bound/proofs",r=loadRecords().contracts;
 const files=fs.readdirSync(dir).filter(x=>/^fresh-\d+-nonce-\d+-signed-checkpoint\.json$/.test(x)).sort((a,b)=>Number(b.match(/^fresh-(\d+)/)[1])-Number(a.match(/^fresh-(\d+)/)[1]));
 if(!files.length)throw Error("No fresh signed proof bundle");
 const prefix=files[0].replace(/-signed-checkpoint\.json$/,""),read=s=>JSON.parse(fs.readFileSync(path.join(dir,prefix+s),"utf8"));
 const signed=read("-signed-checkpoint.json"),v3=read("-v3-public.json"),v4=read("-v4-public.json"),v3proof=read("-v3-proof.json"),v4proof=read("-v4-proof.json"),input=read("-v3-input.json");
 const urls=[process.env.AMOY_RPC_URL,"https://polygon-amoy-bor-rpc.publicnode.com","https://rpc-amoy.polygon.technology","https://polygon-amoy.drpc.org"].filter(Boolean);
 let provider;
 for(const url of [...new Set(urls)])try{
  const p=new ethers.JsonRpcProvider(url,80002,{batchMaxCount:1,staticNetwork:true});
  const chain=await Promise.race([p.send("eth_chainId",[]),new Promise((_,reject)=>setTimeout(()=>reject(Error("RPC timeout")),8000))]);
  if(BigInt(chain)!==80002n)throw Error("Wrong chain");provider=p;console.log("RPC:",new URL(url).host);break;
 }catch(e){console.log("RPC unavailable:",new URL(url).host,e.shortMessage||e.message)}
 if(!provider)throw Error("No Amoy RPC");
 const cp=signed.checkpoint,eq=(a,b)=>BigInt(a)===BigInt(b);
 if(v3.length!==20||v4.length!==5||cp.account.toLowerCase()!==r.EchoSmartAccountV4.toLowerCase()||!eq(v3[18],v4[4])||!eq(v3[18],cp.checkpointCommitment)||!eq(v3[1],cp.authorizationCommitment)||!eq(v3[11],cp.nonce)||!eq(v3[19],cp.timestamp))throw Error("Proof/checkpoint mismatch");
 const account=new ethers.Contract(r.EchoSmartAccountV4,["function nonce() view returns (uint256)","function owner() view returns (address)"],provider);
 const nonce=await account.nonce(),block=await provider.getBlock("latest");
 if(!eq(nonce,cp.nonce))throw Error("Stale nonce");
 if(!block||BigInt(block.timestamp)>BigInt(v3[12]))throw Error("Authorization expired");
 const registry=new ethers.Contract(r.EchoAttestationRegistryV3,[
 "function checkpointDigest((address account,address delegatee,bytes32 zoneHash,bytes32 checkpointCommitment,bytes32 authorizationCommitment,uint64 timestamp,uint256 nonce)) view returns (bytes32)",
 "function attestationPolicies(address,address) view returns (bytes32 allowedZoneHash,uint64 maxTimeDrift,uint8 requiredTier,bool allowValidatorFallback,bool enabled)",
 "function trustedValidatorSigners(address,address) view returns (bool)",
 "function authorizedCheckpointBridges(address,address) view returns (bool)",
 "function consumedCheckpointNonces(address,address,uint256) view returns (bool)"
 ],provider);
 const geo=new ethers.Contract(r.EchoGeographicPolicyRegistryV4,["function getGeographicPolicy(address,address) view returns ((uint256 minLat,uint256 maxLat,uint256 minLon,uint256 maxLon) zone,bytes32 zoneHash,bool enabled)"],provider);
 const bridge=new ethers.Contract(r.EchoAuthorizationBridgeV4,["function authorizedDelegatees(address,address) view returns (bool)","function consumedNullifiers(uint256) view returns (bool)"],provider);
 const digest=await registry.checkpointDigest(cp),recovered=ethers.recoverAddress(digest,signed.signature);
 const [att,gp,trusted,allowedBridge,usedNonce,allowedDelegatee,usedNullifier]=await Promise.all([
 registry.attestationPolicies(cp.account,cp.delegatee),geo.getGeographicPolicy(cp.account,cp.delegatee),
 registry.trustedValidatorSigners(cp.account,recovered),registry.authorizedCheckpointBridges(cp.account,r.EchoAuthorizationBridgeV4),
 registry.consumedCheckpointNonces(cp.account,cp.delegatee,cp.nonce),bridge.authorizedDelegatees(cp.account,cp.delegatee),bridge.consumedNullifiers(v3[2])
 ]);
 const checks=[
 ["validator trusted",trusted&&eq(recovered,v3[5])],
 ["attestation policy and zone",att.enabled&&att.allowedZoneHash.toLowerCase()===cp.zoneHash.toLowerCase()&&Number(att.requiredTier)===0],
 ["checkpoint within policy drift",BigInt(block.timestamp)>=BigInt(cp.timestamp)&&BigInt(block.timestamp)-BigInt(cp.timestamp)<=BigInt(att.maxTimeDrift)],
 ["geographic policy and zone",gp.enabled&&gp.zoneHash.toLowerCase()===cp.zoneHash.toLowerCase()],
 ["geographic public bounds",eq(gp.zone.minLat,v4[0])&&eq(gp.zone.maxLat,v4[1])&&eq(gp.zone.minLon,v4[2])&&eq(gp.zone.maxLon,v4[3])],
 ["checkpoint bridge allowed",allowedBridge],["delegatee authorized",allowedDelegatee],["checkpoint nonce unused",!usedNonce],["nullifier unused",!usedNullifier]
 ];
 for(const [label,ok] of checks)console.log((ok?"PASS ":"BLOCKED ")+label);
 if(checks.some(([,ok])=>!ok))throw Error("Live policy gate blocked; no execution simulation attempted");
 const convert=async(proof,signals)=>JSON.parse("["+await snarkjs.groth16.exportSolidityCallData(proof,signals)+"]");
 const [a3,b3,c3,s3]=await convert(v3proof,v3),[a4,b4,c4,s4]=await convert(v4proof,v4);
 const target=ethers.getAddress(ethers.toBeHex(BigInt(v3[6]),20)),value=BigInt(v3[7]);
 const data=new ethers.Interface(["function setValue(uint256)"]).encodeFunctionData("setValue",[888n]);
 const hash=BigInt(ethers.keccak256(data)),mask=(1n<<128n)-1n;
 if(!eq(input.target,target)||!eq(input.value,value)||!eq(v3[8],hash&mask)||!eq(v3[9],hash>>128n))throw Error("Transaction binding mismatch");
 const abi=["function executeAuthorized((address account,address delegatee,bytes32 zoneHash,bytes32 checkpointCommitment,bytes32 authorizationCommitment,uint64 timestamp,uint256 nonce),bytes,uint256[2],uint256[2][2],uint256[2],uint256[20],uint256[2],uint256[2][2],uint256[2],uint256[5],address,uint256,bytes) returns (bytes)"];
 const iface=new ethers.Interface(abi),calldata=iface.encodeFunctionData("executeAuthorized",[cp,signed.signature,a3,b3,c3,s3,a4,b4,c4,s4,target,value,data]);
 console.log("SIMULATING executeAuthorized via eth_call (no broadcast)");
 try{
  await provider.call({to:r.EchoSmartAccountV4,from:cp.delegatee,data:calldata,gasLimit:12000000n});
  console.log("SUCCESS: live Amoy executeAuthorized eth_call returned without revert");
 }catch(e){console.log("SIMULATION REVERT:",e.shortMessage||e.reason||e.message);process.exitCode=1;}
 console.log("Bundle:",prefix);
 console.log("Transaction broadcast: NO; POL spent: 0");
}
main().catch(e=>{console.error("BLOCKED:",e.shortMessage||e.message);process.exitCode=1});
