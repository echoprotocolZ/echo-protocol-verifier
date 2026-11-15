#!/usr/bin/env node
"use strict";
// Read-only Amoy deployed-account / local artifact comparison.
// No signatures, no impersonation, no transactions, no POL spent.
const {ethers}=require("ethers");
const hre=require("hardhat");
const {loadRecords}=require("./amoy-deployment-records");
async function main(){
 const records=loadRecords(),address=records.contracts.EchoSmartAccountV4;
 if(!address)throw Error("Missing EchoSmartAccountV4 deployment record");
 const url=process.env.AMOY_RPC_URL||"https://polygon-amoy-bor-rpc.publicnode.com";
 const provider=new ethers.JsonRpcProvider(url,80002,{staticNetwork:true,batchMaxCount:1});
 try{
  if(BigInt(await provider.send("eth_chainId",[]))!==80002n)throw Error("Not Polygon Amoy");
  const code=await provider.getCode(address);
  if(code==="0x")throw Error("No code at deployed account");
  const names=(await hre.artifacts.getAllFullyQualifiedNames()).filter(x=>x.endsWith(":EchoSmartAccountV4"));
  if(names.length!==1)throw Error("Compile first or resolve ambiguous EchoSmartAccountV4 artifacts");
  const info=await hre.artifacts.getBuildInfo(names[0]);
  if(!info)throw Error("Missing build info; run npx hardhat compile");
  const [source,name]=names[0].split(":");
  const bytecode=info.output.contracts[source][name].evm.deployedBytecode;
  const expected=bytecode.object.toLowerCase(),actual=code.slice(2).toLowerCase();
  let match=expected.length===actual.length;
  if(match){
   const masked=expected.split("");
   for(const entries of Object.values(bytecode.immutableReferences||{}))
    for(const ref of entries)
     for(let i=ref.start*2;i<(ref.start+ref.length)*2;i++)masked[i]=actual[i];
   match=masked.join("")===actual;
  }
  console.log("Network: Polygon Amoy (80002)");
  console.log("Deployed account:",address);
  console.log("Runtime bytecode SHA256-equivalent keccak256:",ethers.keccak256(code));
  console.log("Compiled artifact:",names[0]);
  console.log("Runtime bytecode matches current compiled source (ignoring immutables):",match?"YES":"NO");
  const abi=new ethers.Interface(["function owner() view returns(address)","function pendingOwner() view returns(address)","function entryPoint() view returns(address)","function nonce() view returns(uint256)","function transferOwnership(address)"]);
  const values={};
  for(const method of ["owner","pendingOwner","entryPoint","nonce"]){
   try{
    const result=await provider.call({to:address,data:abi.encodeFunctionData(method)});
    values[method]=String(abi.decodeFunctionResult(method,result)[0]);
    console.log(method+"():",values[method]);
   }catch(e){console.log(method+"(): UNAVAILABLE / REVERTED ("+(e.shortMessage||e.message)+")")}
  }
  if(values.owner){
   const candidate="0x000000000000000000000000000000000000dEaD";
   try{
    const output=await provider.call({from:values.owner,to:address,data:abi.encodeFunctionData("transferOwnership",[candidate]),gasLimit:3000000n});
    console.log("Owner-initiated transferOwnership eth_call: SUCCEEDED (return "+output+")");
   }catch(e){console.log("Owner-initiated transferOwnership eth_call: REVERTED ("+(e.shortMessage||e.message)+")")}
  }
  console.log("No transaction broadcast. No POL spent.");
  if(!match)process.exitCode=2;
 }finally{provider.destroy()}
}
main().catch(e=>{console.error("AUDIT BLOCKED:",e.message);process.exitCode=1});
