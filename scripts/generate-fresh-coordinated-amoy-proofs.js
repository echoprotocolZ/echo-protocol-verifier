#!/usr/bin/env node
"use strict";
// Generate a coordinated, fresh V3/V4 Groth16 pair. No transaction or signing.
// Outputs separate files; preserves the historical approved-zone and V3 fixtures.
const fs=require("node:fs"),path=require("node:path"),hre=require("hardhat"),snarkjs=require("snarkjs");
const {buildPoseidon}=require("circomlibjs");
const {loadRecords}=require("./amoy-deployment-records");
async function main(){
 if(hre.network.name!=="amoy")throw Error("Amoy only: --network amoy");
 const {ethers}=hre;
 const urls=[process.env.AMOY_RPC_URL,"https://polygon-amoy-bor-rpc.publicnode.com","https://rpc-amoy.polygon.technology","https://polygon-amoy.drpc.org"].filter(Boolean);
 let provider;
 for(const url of [...new Set(urls)]){try{
  const p=new ethers.JsonRpcProvider(url,80002,{batchMaxCount:1,staticNetwork:true});
  const id=await Promise.race([p.send("eth_chainId",[]),new Promise((_,rej)=>setTimeout(()=>rej(Error("RPC timeout")),7000))]);
  if(BigInt(id)!==80002n)throw Error("Wrong chain");provider=p;console.log("RPC:",new URL(url).host);break;
 }catch(e){console.log("RPC unavailable:",new URL(url).host,e.shortMessage||e.message);}}
 if(!provider)throw Error("No available Amoy RPC");
 const r=loadRecords().contracts,dir="build/v4-geographic-bound/proofs";
 const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
 const template=read("build/v3-bound/input-local.json");
 const compatible=read(dir+"/v3-compatible-checkpoint.json");
 const bounds=read(dir+"/approved-zone-public.json");
 if(bounds.length!==5)throw Error("Expected five V4 public signals");
 const poseidon=await buildPoseidon();
 const hash=xs=>BigInt(poseidon.F.toString(poseidon(xs.map(BigInt))));
 const account=r.EchoSmartAccountV4,delegatee="0xbD2dEf17C60C3f6C2dA6eE812F948f4B53f2f803",validator=delegatee;
 const target=r.TestTarget;
 if(!account||!target||await provider.getCode(account)==="0x"||await provider.getCode(target)==="0x")throw Error("Missing Amoy contracts");
 const block=await provider.getBlock("latest");if(!block)throw Error("No Amoy block");
 const timestamp=BigInt(block.timestamp),nonce=await new ethers.Contract(account,["function nonce() view returns (uint256)"],provider).nonce();
 const checkpointX=BigInt(compatible.checkpointX),checkpointY=BigInt(compatible.checkpointY);
 const [minLat,maxLat,minLon,maxLon]=bounds.slice(0,4).map(BigInt);
 if(checkpointX<minLat||checkpointX>maxLat||checkpointY<minLon||checkpointY>maxLon)throw Error("Checkpoint outside existing approved geographic bounds");
 const commitment=hash([checkpointX,checkpointY,timestamp]);
 const v4input={checkpointLat:checkpointX.toString(),checkpointLon:checkpointY.toString(),checkpointTimestamp:timestamp.toString(),minLat:minLat.toString(),maxLat:maxLat.toString(),minLon:minLon.toString(),maxLon:maxLon.toString(),expectedCheckpointCommitment:commitment.toString()};
 const v4wasm="build/v4-geographic-bound/EchoGeographicBoundV4_js/EchoGeographicBoundV4.wasm";
 const v4zkey="build/v4-geographic-bound/setup/EchoGeographicBoundV4_final.zkey";
 console.log("Generating fresh V4 geographic proof...");
 const v4=await snarkjs.groth16.fullProve(v4input,v4wasm,v4zkey);
 if(!(await snarkjs.groth16.verify(await snarkjs.zKey.exportVerificationKey(v4zkey),v4.publicSignals,v4.proof)))throw Error("V4 local verification failed");
 if(v4.publicSignals.length!==5||BigInt(v4.publicSignals[4])!==commitment)throw Error("V4 commitment mismatch");
 console.log("Existing approved-zone public signals:",bounds.map(String).join(", "));
 console.log("Fresh V4 public signals:",v4.publicSignals.map(String).join(", "));
 console.log("V4 input geographic bounds:",[minLat,maxLat,minLon,maxLon].map(String).join(", "));
 for(let i=0;i<4;i++)if(BigInt(v4.publicSignals[i])!==BigInt(bounds[i]))throw Error("V4 public signal mismatch at index "+i+": expected "+bounds[i]+" got "+v4.publicSignals[i]+"; no policy changes made");
 const deadline=timestamp+7200n,minTimestamp=timestamp-3600n,maxTimestamp=timestamp+3600n;
 const fragmentPayload=BigInt(template.fragmentPayload),fragmentSalt=BigInt(template.fragmentSalt);
 const targetX=BigInt(compatible.targetX),targetY=BigInt(compatible.targetY),maxDistanceSq=BigInt(compatible.maxDistanceSq);
 const fragmentCommitment=hash([fragmentPayload,fragmentSalt]);
 const callData=new ethers.Interface(["function setValue(uint256)"]).encodeFunctionData("setValue",[888n]);
 const calldataHash=BigInt(ethers.keccak256(callData)),mask=(1n<<128n)-1n,value=0n;
 const authHash1=hash([BigInt(account),BigInt(delegatee),BigInt(validator),BigInt(target),value,calldataHash&mask,calldataHash>>128n,80002n,nonce,deadline,fragmentCommitment,targetX,targetY,maxDistanceSq,minTimestamp,maxTimestamp]);
 const authorizationCommitment=hash([authHash1,commitment]);
 const nullifier=hash([BigInt(account),authorizationCommitment]);
 const input={expectedFragmentCommitment:fragmentCommitment,expectedCheckpointCommitment:commitment,expectedCheckpointTimestamp:timestamp,expectedAuthorizationCommitment:authorizationCommitment,expectedNullifier:nullifier,account:BigInt(account),delegatee:BigInt(delegatee),validator:BigInt(validator),target:BigInt(target),value,calldataHashLow:calldataHash&mask,calldataHashHigh:calldataHash>>128n,chainId:80002n,nonce,deadline,targetX,targetY,maxDistanceSq,minTimestamp,maxTimestamp,fragmentPayload,fragmentSalt,checkpointX,checkpointY,checkpointTimestamp:timestamp};
 console.log("Generating fresh V3 authorization proof...");
 const v3wasm="build/v3-timestamp-fixed/EchoAuthorizationVerifierV3_js/EchoAuthorizationVerifierV3.wasm";
 const v3zkey="build/v3-timestamp-fixed/EchoAuthorizationVerifierV3_final.zkey";
 const v3=await snarkjs.groth16.fullProve(JSON.parse(JSON.stringify(input,(_,v)=>typeof v==="bigint"?v.toString():v)),v3wasm,v3zkey);
 if(!(await snarkjs.groth16.verify(await snarkjs.zKey.exportVerificationKey(v3zkey),v3.publicSignals,v3.proof)))throw Error("V3 local verification failed");
 if(v3.publicSignals.length!==20||BigInt(v3.publicSignals[18])!==commitment||BigInt(v3.publicSignals[11])!==nonce||BigInt(v3.publicSignals[12])!==deadline)throw Error("V3 binding mismatch");
 const verify=async(name,addr,proof,signals,n)=>{
  const calldata=await snarkjs.groth16.exportSolidityCallData(proof,signals);
  const [a,b,c,pub]=JSON.parse("["+calldata+"]");
  const contract=new ethers.Contract(addr,["function verifyProof(uint256[2],uint256[2][2],uint256[2],uint256["+n+"]) view returns (bool)"],provider);
  const ok=await contract.verifyProof(a,b,c,pub);
  if(!ok)throw Error("Deployed "+name+" verifier rejected proof");
  console.log("On-chain "+name+" verifier: PASS");
 };
 await verify("V3",r.EchoAuthorizationVerifierV3,v3.proof,v3.publicSignals,20);
 await verify("V4",r.EchoGeographicBoundVerifierV4,v4.proof,v4.publicSignals,5);
 // Preserve previous output. Exclusive creation prevents accidental overwrites.
 const tag="fresh-"+timestamp+"-nonce-"+nonce,files=[
  [tag+"-v3-input.json",input],[tag+"-v3-proof.json",v3.proof],[tag+"-v3-public.json",v3.publicSignals],
  [tag+"-v4-input.json",v4input],[tag+"-v4-proof.json",v4.proof],[tag+"-v4-public.json",v4.publicSignals]
 ];
 for(const [name] of files)if(fs.existsSync(path.join(dir,name)))throw Error("Output already exists: "+name);
 for(const [name,obj] of files)fs.writeFileSync(path.join(dir,name),JSON.stringify(obj,(_,v)=>typeof v==="bigint"?v.toString():v,2)+"\n",{flag:"wx",mode:0o600});
 console.log("SUCCESS: fresh V3/V4 Groth16 proofs verified locally and on deployed Amoy verifiers");
 console.log("Checkpoint timestamp:",timestamp.toString(),"Nonce:",nonce.toString());
 console.log("Commitment:",commitment.toString());
 console.log("Artifact prefix:",path.join(dir,tag));
 console.log("No checkpoint signed. No transaction broadcast. No POL spent.");
 console.log("Next: sign new checkpoint, verify attestation policy drift and execution simulation.");
}
main().catch(e=>{console.error("BLOCKED:",e.shortMessage||e.message);process.exitCode=1});
