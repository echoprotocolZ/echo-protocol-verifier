// Read-only readiness check for the NEW bootstrapped account; never broadcasts.
// Run: npx hardhat run scripts/check-bootstrapped-amoy-proof-readiness.js --network amoy
const fs=require("node:fs");
const path=require("node:path");
const hre=require("hardhat");
const {loadRecords}=require("./amoy-deployment-records");
async function main(){
 const {ethers}=hre;
 if(hre.network.name!=="amoy"||(await ethers.provider.getNetwork()).chainId!==80002n)throw Error("Amoy only");
 const filename="deployments/amoy/echo-v4-bootstrapped-account.json";
 if(!fs.existsSync(filename))throw Error("Missing bootstrap deployment record");
 const record=JSON.parse(fs.readFileSync(filename,"utf8"));
 const expected="0xBbb493289FE2698D04a9EC05Fe9Dd1d400Bc418f";
 if(record.chainId!==80002||!ethers.isAddress(record.address)||record.address.toLowerCase()!==expected.toLowerCase())throw Error("Bootstrap record mismatch");
 const original=loadRecords().contracts.EchoSmartAccountV4;
 if(record.originalAccountPreserved.toLowerCase()!==original.toLowerCase())throw Error("Original account mismatch");
 const account=await ethers.getContractAt("EchoSmartAccountV4Bootstrapped",record.address);
 const code=await ethers.provider.getCode(record.address);
 if(code==="0x")throw Error("New account missing on-chain");
 const owner=await account.owner(),bridge=await account.authorizationBridge(),nonce=await account.nonce();
 if(owner.toLowerCase()!==record.owner.toLowerCase()||bridge.toLowerCase()!==record.authorizationBridge.toLowerCase())throw Error("Account wiring mismatch");
 console.log("NEW ACCOUNT:",record.address);
 console.log("OWNER:",owner);
 console.log("BRIDGE:",bridge);
 console.log("NONCE:",nonce.toString());
 console.log("ORIGINAL ACCOUNT PRESERVED:",original);
 const dir="build/v4-geographic-bound/proofs";
 const signed=path.join(dir,"v4-signed-checkpoint.json");
 const publicV3=path.join(dir,"v3-amoy-matching-public.json");
 const publicV4=path.join(dir,"approved-zone-public.json");
 const files=["v4-signed-checkpoint.json","v3-amoy-matching-proof.json","v3-amoy-matching-public.json","approved-zone-proof.json","approved-zone-public.json"];
 let ready=true;
 for(const name of files){
  const exists=fs.existsSync(path.join(dir,name));
  console.log("PROOF FILE:",name,exists?"present":"MISSING");
  if(!exists)ready=false;
 }
 if(ready){
  const checkpoint=JSON.parse(fs.readFileSync(signed,"utf8")).checkpoint;
  const v3=JSON.parse(fs.readFileSync(publicV3,"utf8"));
  const v4=JSON.parse(fs.readFileSync(publicV4,"utf8"));
  const checks=[
   ["checkpoint account",checkpoint.account?.toLowerCase()===record.address.toLowerCase()],
   ["checkpoint nonce",BigInt(checkpoint.nonce)===nonce],
   ["V3 nonce",BigInt(v3[11])===nonce],
   ["V3/V4 commitment",BigInt(v3[18])===BigInt(v4[4])],
   ["checkpoint commitment",BigInt(checkpoint.checkpointCommitment)===BigInt(v3[18])]
  ];
  for(const [label,ok] of checks){console.log("BINDING:",label,ok?"PASS":"REGENERATE");if(!ok)ready=false}
 }
 console.log(ready?"PROOF MATERIAL BINDINGS PASS (not yet simulated)":"PROOF MATERIAL NOT READY: regenerate for new account before simulation");
 console.log("READ-ONLY: no transactions broadcast");
 if(!ready)process.exitCode=2;
}
main().catch(e=>{console.error("ERROR:",e.shortMessage||e.message);process.exitCode=1});
