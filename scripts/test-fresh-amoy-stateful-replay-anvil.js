#!/usr/bin/env node
"use strict";
// Stateful real-proof replay and rollback test in a disposable Anvil fork. No live broadcasts.
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
 // Launch-readiness acceptance: inspect the target contract's observable
 // storage before and after the genuine authorized execution.
 const targetSlot0Before=await provider.send("eth_getStorageAt",[target,"0x0","latest"]);
 const snapshot=await network.provider.send("evm_snapshot",[]);
 try{
  const tx=await signer.sendTransaction({to:cp.account,data:calldata,gasLimit:12000000n});
  const receipt=await tx.wait();
  if(!receipt||receipt.status!==1)throw Error("Fork transaction did not succeed");
  const nonce1=await account.nonce(),used1=await registry.consumedCheckpointNonces(cp.account,cp.delegatee,cp.nonce),null1=await bridge.consumedNullifiers(v3[2]);
  if(nonce1!==nonce0+1n||!used1||!null1)throw Error("Post-execution nonce/checkpoint/nullifier invariant failed");
  const targetSlot0After=await provider.send("eth_getStorageAt",[target,"0x0","latest"]);
  if(BigInt(targetSlot0After)!==888n||BigInt(targetSlot0Before)===888n)
   throw Error("LAUNCH READINESS BLOCKED: target slot 0 did not change to expected value 888; inspect target storage layout");
  console.log("PASS end-to-end target contract state changed to 888");
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
  // Restore pristine authorization state before testing target failure independently.
  if(!(await network.provider.send("evm_revert",[snapshot])))throw Error("Failed to restore baseline after replay test");
  // First establish that the exact genuine proof succeeds against the unmodified target.
  // eth_call does not persist nonce, checkpoint, or nullifier consumption.
  await provider.call({from:cp.delegatee,to:cp.account,data:calldata,gasLimit:12000000n});
  console.log("PASS valid proof preflight against original target");
  const originalCode=await provider.getCode(target);
  if(originalCode==="0x")throw Error("Original target has no deployed code");
  // Replace only the target's bytecode on this disposable fork. The proof,
  // signature, call data, policy, and authorization contracts remain unchanged.
  const rollbackSnapshot=await network.provider.send("evm_snapshot",[]);
  try{
   await network.provider.send("anvil_setCode",[target,"0x60006000fd"]);
   const patchedCode=await provider.send("eth_getCode",[target,"latest"]);
   if(patchedCode.toLowerCase()!=="0x60006000fd")throw Error("Reverting target setup failed: expected 0x60006000fd, got "+patchedCode.slice(0,80));
   let reverted=false;
   try{
    const failed=await signer.sendTransaction({to:cp.account,data:calldata,gasLimit:12000000n});
    const failedReceipt=await failed.wait();
    reverted=!!failedReceipt&&failedReceipt.status===0;
   }catch(e){
    // A JSON-RPC rejection or ethers CALL_EXCEPTION can indicate revert;
    // the state assertions below still independently verify rollback.
    reverted=true;
   }
   if(!reverted)throw Error("CRITICAL: Reverting target unexpectedly succeeded");
   if(await account.nonce()!==nonce0||
      await registry.consumedCheckpointNonces(cp.account,cp.delegatee,cp.nonce)!==used0||
      await bridge.consumedNullifiers(v3[2])!==null0)
    throw Error("CRITICAL: Reverting target left partial authorization state");
   console.log("PASS valid-proof execution with reverting target rejected");
   console.log("PASS target revert left nonce/checkpoint/nullifier unchanged");
  }finally{
   if(!(await network.provider.send("evm_revert",[rollbackSnapshot])))throw Error("Could not restore pre-rollback fork snapshot");
  }
  if((await provider.send("eth_getCode",[target,"latest"])).toLowerCase()!==originalCode.toLowerCase())throw Error("Original target bytecode not restored");
  if(await account.nonce()!==nonce0||
     await registry.consumedCheckpointNonces(cp.account,cp.delegatee,cp.nonce)!==used0||
     await bridge.consumedNullifiers(v3[2])!==null0)
   throw Error("Authorization state not restored before positive test");

  // Negative integration: preserve genuine proofs and checkpoint signature,
  // but alter the authorized target call. The V3 transaction binding must reject it.
  const tamperedData=new ethers.Interface(["function setValue(uint256)"]).encodeFunctionData("setValue",[889n]);
  if(tamperedData===data)throw Error("Tampered call data was not changed");
  const tamperedCalldata=iface.encodeFunctionData("executeAuthorized",[cp,signed.signature,a3,b3,c3,s3,a4,b4,c4,s4,target,BigInt(v3[7]),tamperedData]);
  // Policy/signature integrity: a changed geographic zone cannot reuse the
  // validator signature of the original checkpoint.
  const alteredZone=ethers.toBeHex(BigInt(cp.zoneHash)^1n,32);
  const alteredCheckpoint={...cp,zoneHash:alteredZone};
  const zoneCalldata=iface.encodeFunctionData("executeAuthorized",[alteredCheckpoint,signed.signature,a3,b3,c3,s3,a4,b4,c4,s4,target,BigInt(v3[7]),data]);
  console.log("DIAGNOSTIC: checking altered checkpoint geographic zone");
  const assertReverts=async (call,label)=>{
   let timer;
   try{
    await Promise.race([provider.call({from:cp.delegatee,to:cp.account,data:call,gasLimit:12000000n}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("TIMEOUT: "+label)),30000)})]);
   }catch(e){
    if(String(e.message).includes("TIMEOUT:"))throw e;
    if(e.code==="CALL_EXCEPTION"||/execution reverted|revert/i.test(e.shortMessage||e.message||""))return;
    throw e;
   }finally{clearTimeout(timer)}
   throw Error("CRITICAL: "+label+" unexpectedly accepted");
  };
  await assertReverts(zoneCalldata,"altered geographic checkpoint");
  if(await account.nonce()!==nonce0||
     await registry.consumedCheckpointNonces(cp.account,cp.delegatee,cp.nonce)!==used0||
     await bridge.consumedNullifiers(v3[2])!==null0)
   throw Error("CRITICAL: altered geographic checkpoint changed authorization state");
  console.log("PASS altered checkpoint geographic zone rejected");
  console.log("PASS geographic checkpoint tampering left authorization state unchanged");
  // Signature integrity: alter only the validator's ECDSA signature while
  // retaining the original valid checkpoint and both genuine Groth16 proofs.
  const signatureBytes=ethers.getBytes(signed.signature);
  if(signatureBytes.length!==65)throw Error("Unexpected checkpoint signature length");
  signatureBytes[10]^=1;
  const corruptedSignature=ethers.hexlify(signatureBytes);
  const signatureCalldata=iface.encodeFunctionData("executeAuthorized",[cp,corruptedSignature,a3,b3,c3,s3,a4,b4,c4,s4,target,BigInt(v3[7]),data]);
  console.log("DIAGNOSTIC: checking corrupted validator signature");
  await assertReverts(signatureCalldata,"corrupted validator signature");
  if(await account.nonce()!==nonce0||
     await registry.consumedCheckpointNonces(cp.account,cp.delegatee,cp.nonce)!==used0||
     await bridge.consumedNullifiers(v3[2])!==null0)
   throw Error("CRITICAL: corrupted validator signature changed authorization state");
  console.log("PASS corrupted validator signature rejected");
  console.log("PASS signature rejection left authorization state unchanged");
  // Deployed-account administration lockdown, checked against the actual forked
  // bytecode. eth_call does not persist changes; check all relevant state.
  const admin=new ethers.Interface([
   "function owner() view returns (address)",
   "function pendingOwner() view returns (address)",
   "function entryPoint() view returns (address)",
   "function transferOwnership(address)",
   "function acceptOwnership()",
   "function setEntryPoint(address)",
   "function executeAdministration(address,bytes)",
   "function executeGeographicAdministration(bytes)"
  ]);
  const owner0=await provider.call({to:cp.account,data:admin.encodeFunctionData("owner")});
  const pending0=await provider.call({to:cp.account,data:admin.encodeFunctionData("pendingOwner")});
  const entry0=await provider.call({to:cp.account,data:admin.encodeFunctionData("entryPoint")});
  const ownerAddress=admin.decodeFunctionResult("owner",owner0)[0];
  const candidate=ethers.Wallet.createRandom().address;
  const adminCases=[
   ["ownership transfer",admin.encodeFunctionData("transferOwnership",[candidate])],
   ["ownership acceptance",admin.encodeFunctionData("acceptOwnership")],
   ["entry point update",admin.encodeFunctionData("setEntryPoint",[candidate])],
   ["general administration",admin.encodeFunctionData("executeAdministration",[target,"0x"])],
   ["geographic administration",admin.encodeFunctionData("executeGeographicAdministration",["0x"])]
  ];
  console.log("DIAGNOSTIC: checking deployed account administration lockdown");
  for(const [label,adminData] of adminCases){
   // The owner is the strongest caller to test: even owner privileges must
   // not bypass the proof-bound administration lockdown.
   let timer;
   try{
    await Promise.race([
     provider.call({from:ownerAddress,to:cp.account,data:adminData,gasLimit:3000000n}),
     new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("TIMEOUT: "+label)),30000)})
    ]);
    throw Error("CRITICAL: "+label+" unexpectedly succeeded");
   }catch(e){
    if(String(e.message).includes("TIMEOUT:")||String(e.message).includes("CRITICAL:"))throw e;
    if(!(e.code==="CALL_EXCEPTION"||/execution reverted|revert/i.test(e.shortMessage||e.message||"")))throw e;
   }finally{clearTimeout(timer)}
   console.log("PASS owner-initiated "+label+" rejected");
  }
  if(await provider.call({to:cp.account,data:admin.encodeFunctionData("owner")})!==owner0||
     await provider.call({to:cp.account,data:admin.encodeFunctionData("pendingOwner")})!==pending0||
     await provider.call({to:cp.account,data:admin.encodeFunctionData("entryPoint")})!==entry0||
     await account.nonce()!==nonce0||
     await registry.consumedCheckpointNonces(cp.account,cp.delegatee,cp.nonce)!==used0||
     await bridge.consumedNullifiers(v3[2])!==null0)
   throw Error("CRITICAL: administration lockdown changed account or authorization state");
  console.log("PASS deployed administration lockdown preserved ownership and authorization state");
  console.log("DIAGNOSTIC: beginning tampered transaction test");
  const tamperSnapshot=await network.provider.send("evm_snapshot",[]);
  try{
   // eth_call uses the same real verifiers and must revert without waiting for mining.
   // Timeouts are NOT considered successful rejection.
   const deadline=async(p,label)=>Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(Error("TIMEOUT: "+label)),30000))]);
   let rejected=false;
   console.log("DIAGNOSTIC: calling tampered authorization (30s timeout)");
   try{
    await deadline(provider.call({from:cp.delegatee,to:cp.account,data:tamperedCalldata,gasLimit:12000000n}),"tampered eth_call");
   }catch(e){
    if(String(e.message).includes("TIMEOUT:"))throw e;
    if(e.code==="CALL_EXCEPTION"||/execution reverted|revert/i.test(e.shortMessage||e.message||""))rejected=true;
    else throw e;
   }
   if(!rejected)throw Error("CRITICAL: Tampered authorization unexpectedly accepted");
   if(await account.nonce()!==nonce0||
      await registry.consumedCheckpointNonces(cp.account,cp.delegatee,cp.nonce)!==used0||
      await bridge.consumedNullifiers(v3[2])!==null0)
    throw Error("CRITICAL: Tampered transaction changed authorization state");
   console.log("PASS altered target calldata rejected by eth_call with original valid proofs");
   console.log("PASS tampered execution left nonce/checkpoint/nullifier unchanged");
  }finally{
   if(!(await network.provider.send("evm_revert",[tamperSnapshot])))throw Error("Failed to restore fork after tamper test");
  }


 }finally{
  await network.provider.send("anvil_stopImpersonatingAccount",[cp.delegatee]);
 }
 console.log("END-TO-END TARGET STATE ACCEPTANCE PASSED on disposable local fork");
 console.log("STATEFUL REPLAY TEST PASSED on disposable local fork");
 console.log("ATOMIC ROLLBACK TEST PASSED on disposable local fork");
 console.log("TRANSACTION TAMPERING TEST PASSED on disposable local fork");
 console.log("GEOGRAPHIC CHECKPOINT TAMPERING TEST PASSED on disposable local fork");
 console.log("VALIDATOR SIGNATURE TAMPERING TEST PASSED on disposable local fork");
 console.log("ADMINISTRATION LOCKDOWN TEST PASSED on disposable local fork");
 console.log("Live transaction broadcast: NO; live POL spent: 0");
 }finally{anvil.kill("SIGTERM");provider.destroy();}
}
main().catch(e=>{console.error("BLOCKED:",e.shortMessage||e.message);process.exitCode=1});
