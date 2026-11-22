// Read-only diagnostics for the legacy Amoy smart account.
// Run: npx hardhat run scripts/diagnose-amoy-account.js --network amoy
const hre=require("hardhat");
const {loadRecords}=require("./amoy-deployment-records");
async function main(){
 const net=await hre.ethers.provider.getNetwork();
 if(net.chainId!==80002n)throw Error("Amoy required");
 const address=loadRecords().contracts.EchoSmartAccountV4;
 if(!address)throw Error("No recorded account address");
 const code=await hre.ethers.provider.getCode(address);
 if(code==="0x")throw Error("No contract deployed");
 const artifact=await hre.artifacts.readArtifact("EchoSmartAccountV4");
 const expected=artifact.deployedBytecode;
 const bytes=x=>(x.length-2)/2;
 console.log("Account:",address);
 console.log("Deployed runtime bytes:",bytes(code));
 console.log("Current compiled runtime bytes:",bytes(expected));
 console.log("Exact runtime bytecode match:",code.toLowerCase()===expected.toLowerCase());
 const c=await hre.ethers.getContractAt("EchoSmartAccountV4",address);
 for(const fn of ["owner","entryPoint","authorizationBridge","nonce"]){
  try{console.log(fn+":",String(await c[fn]()))}
  catch(e){console.log(fn+": unavailable:",e.shortMessage||e.message)}
 }
 console.log("No transactions broadcast; legacy account preserved.");
}
main().catch(e=>{console.error(e);process.exitCode=1});
