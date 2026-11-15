#!/usr/bin/env node
"use strict";
// Stateful real-proof replay test in a disposable Hardhat fork. No live broadcasts.
const fs=require("node:fs"),path=require("node:path"),snarkjs=require("snarkjs");
const {spawn}=require("node:child_process");
const {ethers}=require("ethers");
const {loadRecords}=require("./amoy-deployment-records");
async function main(){
 const r=loadRecords().contracts,dir="build/v4-geographic-bound/proofs";
 const files=fs.readdirSync(dir).filter(x=>/^fresh-\d+-nonce-\d+-signed-checkpoint\.json$/.test(x)).sort((a,b)=>Number(b.match(/^fresh-(\d+)/)[1])-Number(a.match(/^fresh-(\d+)/)[1]));
 if(!files.length)throw Error("No signed fresh proof bundle");
 const prefix=files[0].replace(/-signed-checkpoint\.json$/,""),read=s=>JSON.parse(fs.readFileSync(path.join(dir,prefix+s),"utf8"));
 const signed=read("-signed-checkpoint.json"),v3=read("-v3-public.json"),v4=read("-v4-public.json"),p3=read("-v3-proof.json"),p4=read("-v4-proof.json"),cp=signed.checkpoint;
 if(cp.account.toLowerCase()!==r.EchoSmartAccountV4.toLowerCase())throw Error("Fixture is not for original account");
 if(v3.length!==20||v4.length!==5||BigInt(v3[18])!==BigInt(v4[4]))throw Error("Proof public-signal mismatch");
 const urls=[process.env.AMOY_RPC_URL,"https://polygon-amoy-bor-rpc.publicnode.com","https://rpc-amoy.polygon.technology","https://polygon-amoy.drpc.org"].filter(Boolean);
 let url,probe;
 for(const candidate of [...new Set(urls)])try{
  const p=new ethers.JsonRpcProvider(candidate,80002,{staticNetwork:true,batchMaxCount:1});
  const id=await Promise.race([p.send("eth_chainId",[]),new Promise((_,rej)=>setTimeout(()=>rej(Error("RPC timeout")),8000))]);
  if(BigInt(id)!==80002n)throw Error("Not Amoy");
  url=candidate;probe=p;break;
 }catch(e){console.log("RPC probe failed:",new URL(candidate).host)}
 if(!url)throw Error("No working Amoy RPC");
 const live=await probe.getBlock("latest");
 if(!live)throw Error("No Amoy block");
 const reg=new ethers.Contract(r.EchoAttestationRegistryV3,["function attestationPolicies(address,address) view returns (bytes32 allowedZoneHash,uint64 maxTimeDrift,uint8 requiredTier,bool allowValidatorFallback,bool enabled)"],probe);
 const policy=await reg.attestationPolicies(cp.account,cp.delegatee);
 const delta=BigInt(live.timestamp)-BigInt(cp.timestamp);
 if(!policy.enabled||delta<0n||delta>BigInt(policy.maxTimeDrift)||BigInt(live.timestamp)>BigInt(v3[12]))throw Error("Proof/checkpoint expired on Amoy; generate and sign a new bundle first");
 console.log("Forking Amoy at block",live.number,"via",new URL(url).host);
 const port=Number(process.env.ECHO_ANVIL_PORT||18547);
 const anvil=spawn("anvil",["--fork-url",url,"--fork-block-number",String(live.number),"--chain-id","80002","--hardfork","cancun","--port",String(port),"--host","127.0.0.1","--silent"],{stdio:["ignore","pipe","pipe"]});
 let output="";for(const stream of [anvil.stdout,anvil.stderr])stream.on("data",d=>{output+=String(d).slice(-4000);});
 const provider=new ethers.JsonRpcProvider(`http://127.0.0.1:${port}`,80002,{staticNetwork:true,batchMaxCount:1});
 try{
 let ready=false;
 for(let i=0;i<50;i++){
  if(anvil.exitCode!==null)throw Error("Anvil exited: "+output);
  try{if(BigInt(await provider.send("eth_chainId",[]))===80002n){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 if(!ready)throw Error("Anvil did not start: "+output);
 const network={provider};
 if(BigInt(await provider.send("eth_chainId",[]))!==80002n)throw Error("Fork chain ID mismatch");
 const forkBlock=await provider.getBlock("latest");
 if(!forkBlock||BigInt(forkBlock.timestamp)<BigInt(cp.timestamp))throw Error("Fork time mismatch");
 const account=new ethers.Contract(r.EchoSmartAccountV4,["function nonce() view returns (uint256)"],provider);
 const registry=new ethers.Contract(r.EchoAttestationRegistryV3,["function consumedCheckpointNonces(address,address,uint256) view returns (bool)"],provider);
 const bridge=new ethers.Contract(r.EchoAuthorizationBridgeV4,["function consumedNullifiers(uint256) view returns (bool)"],provider);
 const nonce0=await account.nonce(),used0=await registry.consumedCheckpointNonces(cp.account,cp.delegatee,cp.nonce),null0=await bridge.consumedNullifiers(v3[2]);
 if(nonce0!==BigInt(cp.nonce)||used0||null0)throw Error("Initial nonce or consumption state invalid");
 const convert=async(proof,signals)=>JSON.parse("["+await snarkjs.groth16.exportSolidityCallData(proof,signals)+"]");
 const [a3,b3,c3,s3]=await convert(p3,v3),[a4,b4,c4,s4]=await convert(p4,v4);
 const target=ethers.getAddress(ethers.toBeHex(BigInt(v3[6]),20));
 const data=new ethers.Interface(["function setValue(uint256)"]).encodeFunctionData("setValue",[888n]);
 const iface=new ethers.Interface(["function executeAuthorized((address account,address delegatee,bytes32 zoneHash,bytes32 checkpointCommitment,bytes32 authorizationCommitment,uint64 timestamp,uint256 nonce),bytes,uint256[2],uint256[2][2],uint256[2],uint256[20],uint256[2],uint256[2][2],uint256[2],uint256[5],address,uint256,bytes) returns (bytes)"]);
 const calldata=iface.encodeFunctionData("executeAuthorized",[cp,signed.signature,a3,b3,c3,s3,a4,b4,c4,s4,target,BigInt(v3[7]),data]);
 const hash=BigInt(ethers.keccak256(data)),mask=(1n<<128n)-1n;
 if(BigInt(v3[7])!==0n||BigInt(v3[8])!==(hash&mask)||BigInt(v3[9])!==(hash>>128n))throw Error("Unexpected target call binding");
 // Set local fork clock to checkpoint timestamp + 1 if feasible, but never rewind a fork.
 const desired=BigInt(forkBlock.timestamp)+1n;
 if(desired-BigInt(cp.timestamp)>BigInt(policy.maxTimeDrift))throw Error("Fork block too late for checkpoint");
 await network.provider.send("evm_setNextBlockTimestamp",[Number(desired)]);
 await network.provider.send("anvil_impersonateAccount",[cp.delegatee]);
 await network.provider.send("anvil_setBalance",[cp.delegatee,ethers.toBeHex(ethers.parseEther("2"))]);
 const signer=await provider.getSigner(cp.delegatee);
 const snapshot=await network.provider.send("evm_snapshot",[]);
 try{
  const tx=await signer.sendTransaction({to:cp.account,data:calldata,gasLimit:12000000n});
  const receipt=await tx.wait();
  if(!receipt||receipt.status!==1)throw Error("Fork transaction did not succeed");
  const nonce1=await account.nonce(),used1=await registry.consumedCheckpointNonces(cp.account,cp.delegatee,cp.nonce),null1=await bridge.consumedNullifiers(v3[2]);
  if(nonce1!==nonce0+1n||!used1||!null1)throw Error("Post-execution nonce/checkpoint/nullifier invariant failed");
  console.log("PASS genuine proof-backed fork transaction succeeded");
  console.log("PASS nonce advanced exactly once");
  console.log("PASS checkpoint nonce consumed");
  console.log("PASS nullifier consumed");
  let rejected=false;
  try{const replay=await signer.sendTransaction({to:cp.account,data:calldata,gasLimit:12000000n});const replayReceipt=await replay.wait();rejected=!replayReceipt||replayReceipt.status===0}
  catch(e){rejected=true}
  if(!rejected)throw Error("CRITICAL: Replay unexpectedly succeeded");
  if(await account.nonce()!==nonce1||!(await registry.consumedCheckpointNonces(cp.account,cp.delegatee,cp.nonce))||!(await bridge.consumedNullifiers(v3[2])))throw Error("Replay changed consumption state");
  console.log("PASS identical transaction replay rejected");
  console.log("PASS replay left nonce and consumption state unchanged");
 }finally{
  await network.provider.send("evm_revert",[snapshot]);
  await network.provider.send("anvil_stopImpersonatingAccount",[cp.delegatee]);
 }
 console.log("STATEFUL REPLAY TEST PASSED on disposable local fork");
 console.log("Atomic rollback after a valid proof reaches a reverting target: NOT TESTED");
 console.log("Live transaction broadcast: NO; live POL spent: 0");
 }finally{anvil.kill("SIGTERM");provider.destroy();}
}
main().catch(e=>{console.error("BLOCKED:",e.shortMessage||e.message);process.exitCode=1});
