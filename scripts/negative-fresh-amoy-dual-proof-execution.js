#!/usr/bin/env node
"use strict";
// Read-only negative execution tests against real Amoy contracts and proof fixtures.
// Never broadcasts. A successful eth_call must not be confused with stateful replay testing.
const fs=require("node:fs"),path=require("node:path"),hre=require("hardhat"),snarkjs=require("snarkjs");
const {loadRecords}=require("./amoy-deployment-records");
async function main(){
 if(hre.network.name!=="amoy")throw Error("Amoy only");
 const {ethers}=hre,r=loadRecords().contracts,dir="build/v4-geographic-bound/proofs";
 const files=fs.readdirSync(dir).filter(x=>/^fresh-\d+-nonce-\d+-signed-checkpoint\.json$/.test(x)).sort((a,b)=>Number(b.match(/^fresh-(\d+)/)[1])-Number(a.match(/^fresh-(\d+)/)[1]));
 if(!files.length)throw Error("Missing fresh signed checkpoint");
 const prefix=files[0].replace(/-signed-checkpoint\.json$/,"");
 const read=s=>JSON.parse(fs.readFileSync(path.join(dir,prefix+s),"utf8"));
 const signed=read("-signed-checkpoint.json"),v3=read("-v3-public.json"),v4=read("-v4-public.json"),p3=read("-v3-proof.json"),p4=read("-v4-proof.json");
 const urls=[process.env.AMOY_RPC_URL,"https://polygon-amoy-bor-rpc.publicnode.com","https://rpc-amoy.polygon.technology","https://polygon-amoy.drpc.org"].filter(Boolean);
 let provider;
 for(const url of [...new Set(urls)])try{
  const candidate=new ethers.JsonRpcProvider(url,80002,{batchMaxCount:1,staticNetwork:true});
  const id=await Promise.race([candidate.send("eth_chainId",[]),new Promise((_,reject)=>setTimeout(()=>reject(Error("RPC probe timeout")),8000))]);
  if(BigInt(id)!==80002n)throw Error("Wrong chain");
  provider=candidate;console.log("RPC:",new URL(url).host);break;
 }catch(e){console.log("RPC unavailable:",new URL(url).host,e.shortMessage||e.message)}
 if(!provider)throw Error("No Amoy RPC available");
 const nonce=await new ethers.Contract(r.EchoSmartAccountV4,["function nonce() view returns (uint256)"],provider).nonce();
 const block=await provider.getBlock("latest");
 if(!block||BigInt(block.timestamp)>BigInt(v3[12])||BigInt(nonce)!==BigInt(v3[11]))throw Error("Fixture expired or nonce changed; regenerate fresh bundle before negative testing");
 const registry=new ethers.Contract(r.EchoAttestationRegistryV3,["function attestationPolicies(address,address) view returns (bytes32 allowedZoneHash,uint64 maxTimeDrift,uint8 requiredTier,bool allowValidatorFallback,bool enabled)"],provider);
 const policy=await registry.attestationPolicies(signed.checkpoint.account,signed.checkpoint.delegatee);
 if(!policy.enabled||BigInt(block.timestamp)-BigInt(signed.checkpoint.timestamp)>BigInt(policy.maxTimeDrift))throw Error("Checkpoint outside policy drift; regenerate fresh bundle");
 const convert=async(proof,signals)=>JSON.parse("["+await snarkjs.groth16.exportSolidityCallData(proof,signals)+"]");
 const [a3,b3,c3,s3]=await convert(p3,v3),[a4,b4,c4,s4]=await convert(p4,v4);
 const abi=["function executeAuthorized((address account,address delegatee,bytes32 zoneHash,bytes32 checkpointCommitment,bytes32 authorizationCommitment,uint64 timestamp,uint256 nonce),bytes,uint256[2],uint256[2][2],uint256[2],uint256[20],uint256[2],uint256[2][2],uint256[2],uint256[5],address,uint256,bytes) returns (bytes)"];
 const iface=new ethers.Interface(abi),target=ethers.getAddress(ethers.toBeHex(BigInt(v3[6]),20));
 const data=new ethers.Interface(["function setValue(uint256)"]).encodeFunctionData("setValue",[888n]);
 const base=[signed.checkpoint,signed.signature,a3,b3,c3,s3,a4,b4,c4,s4,target,BigInt(v3[7]),data];
 const call=async(args,from=signed.checkpoint.delegatee)=>provider.call({to:r.EchoSmartAccountV4,from,data:iface.encodeFunctionData("executeAuthorized",args),gasLimit:12000000n});
 console.log("Fixture:",prefix);
 console.log("Baseline valid simulation...");
 await call(base);
 console.log("PASS baseline valid authorization");
 let passed=0;
 async function reject(name,args,from){
  try{await call(args,from);console.log("FAIL accepted "+name);process.exitCode=1}
  catch(e){console.log("PASS rejected "+name+": "+(e.reason||e.shortMessage||e.message).slice(0,180));passed++}
 }
 const modified=(index,value)=>{const args=[...base];args[index]=value;return args};
 await reject("unauthorized caller",base,"0x000000000000000000000000000000000000dEaD");
 await reject("wrong target",modified(10,"0x000000000000000000000000000000000000dEaD"));
 await reject("modified calldata",modified(12,new ethers.Interface(["function setValue(uint256)"]).encodeFunctionData("setValue",[889n])));
 await reject("modified value",modified(11,1n));
 await reject("invalid signature",modified(1,"0x"+signed.signature.slice(2,130)+"00"));
 const wrongNonce={...signed.checkpoint,nonce:(BigInt(signed.checkpoint.nonce)+1n).toString()};
 await reject("altered checkpoint nonce",modified(0,wrongNonce));
 const wrongV4=[...s4];wrongV4[4]=(BigInt(wrongV4[4])+1n).toString();
 await reject("tampered V4 checkpoint signal",modified(9,wrongV4));
 const wrongV3=[...s3];wrongV3[11]=(BigInt(wrongV3[11])+1n).toString();
 await reject("tampered V3 nonce signal",modified(5,wrongV3));
 console.log("SUMMARY:",passed,"/8 negative simulations rejected");
 console.log("No transactions broadcast. This does not test persistent replay consumption or rollback.");
 if(passed!==8)process.exitCode=1;
}
main().catch(e=>{console.error("BLOCKED:",e.shortMessage||e.message);process.exitCode=1});
