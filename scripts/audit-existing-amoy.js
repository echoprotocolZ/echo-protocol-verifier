// Read-only audit of existing Polygon Amoy deployment records.
// Run: npx hardhat run scripts/audit-existing-amoy.js --network amoy
const hre=require("hardhat");
const {loadRecords,getExistingDeployment}=require("./amoy-deployment-records");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function retry(label,fn){
 for(let attempt=1;attempt<=4;attempt++){
  try{return await fn()}catch(e){
   if(!/timeout|rate.limit|429|503|free plan|network error/i.test(e.message||"")||attempt===4)throw e;
   const wait=attempt*2500;
   console.log("RPC RETRY:",label,"attempt",attempt,"waiting",wait,"ms");
   await sleep(wait);
  }
 }
}
async function main(){
 const net=await hre.ethers.provider.getNetwork();
 if(net.chainId!==80002n)throw Error("Polygon Amoy chain 80002 required");
 const records=loadRecords();
 const names=[
 "EchoAttestationRegistryV3","EchoAuthorizationVerifierV3",
 "EchoAuthorizationBridgeV3","EchoGeographicPolicyRegistryV4",
 "EchoGeographicBoundVerifierV4","EchoGeographicProofGatewayV4",
 "EchoDualProofVerifierV4","EchoAuthorizationBridgeV4","EchoSmartAccountV4","TestTarget"];
 let issues=0;
 for(const name of names){
  await sleep(350);
  const address=records.contracts[name];
  if(!address){console.log("MISSING RECORD:",name);issues++;continue}
  try{
   const code=await retry(name+" code",()=>hre.ethers.provider.getCode(address));
   if(code==="0x")throw Error("No deployed code");
   await retry(name+" bytecode",()=>getExistingDeployment(hre.ethers.provider,records,name));
   console.log("MATCH:",name,address);
  }catch(e){issues++;console.log("REVIEW:",name,address,e.message)}
 }
 const r=records.contracts;
 const checks=[
  ["V3 bridge verifier","EchoAuthorizationBridgeV3","verifier","EchoAuthorizationVerifierV3"],
  ["V3 bridge registry","EchoAuthorizationBridgeV3","checkpointRegistry","EchoAttestationRegistryV3"],
  ["Gateway verifier","EchoGeographicProofGatewayV4","verifier","EchoGeographicBoundVerifierV4"],
  ["Gateway policy","EchoGeographicProofGatewayV4","policyRegistry","EchoGeographicPolicyRegistryV4"],
  ["Dual V3 bridge","EchoDualProofVerifierV4","v3Bridge","EchoAuthorizationBridgeV3"],
  ["Dual V4 gateway","EchoDualProofVerifierV4","v4Gateway","EchoGeographicProofGatewayV4"],
  ["V4 bridge dual verifier","EchoAuthorizationBridgeV4","dualProofVerifier","EchoDualProofVerifierV4"],
  ["V4 bridge registry","EchoAuthorizationBridgeV4","checkpointRegistry","EchoAttestationRegistryV3"],
  ["Original account bridge","EchoSmartAccountV4","authorizationBridge","EchoAuthorizationBridgeV4"]
 ];
 for(const [label,contractName,getter,dependency] of checks){
  await sleep(350);
  if(!r[contractName]||!r[dependency]){issues++;console.log("REVIEW:",label,"missing address");continue}
  try{
   const c=await hre.ethers.getContractAt(contractName,r[contractName]);
   const actual=await retry(label,()=>c[getter]());
   if(actual.toLowerCase()!==r[dependency].toLowerCase())throw Error("expected "+r[dependency]+", found "+actual);
   console.log("CONNECTED:",label);
  }catch(e){issues++;console.log("REVIEW:",label,e.message)}
 }
 console.log("READ-ONLY AMOY AUDIT:",issues===0?"PASS":"REVIEW REQUIRED",issues,"issue(s)");
 if(issues)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
