// Deploy ONLY a new bootstrapped account against existing verified Amoy contracts.
// Dry-run by default. To broadcast: CONFIRM_ECHO_ACCOUNT_ONLY_DEPLOY=YES.
// Run: npx hardhat run scripts/deploy-existing-amoy-account-only.js --network amoy
const fs=require("node:fs");
const path=require("node:path");
const {ethers,network}=require("hardhat");
const {loadRecords,getExistingDeployment}=require("./amoy-deployment-records");
const REQUIRED=["EchoAttestationRegistryV3","EchoAuthorizationVerifierV3","EchoAuthorizationBridgeV3","EchoGeographicPolicyRegistryV4","EchoGeographicBoundVerifierV4","EchoGeographicProofGatewayV4","EchoDualProofVerifierV4","EchoAuthorizationBridgeV4"];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function retry(label,fn){
 for(let i=1;i<=5;i++){
  try{return await fn()}catch(e){
   if(!/timeout|rate.limit|429|503|free plan|network error/i.test(e.message||"")||i===5)throw e;
   console.log("RPC RETRY:",label,"attempt",i);await sleep(i*3000);
  }
 }
}
async function main(){
 if(network.name!=="amoy"||(await ethers.provider.getNetwork()).chainId!==80002n)throw Error("Amoy only");
 const records=loadRecords();
 for(const name of REQUIRED){await sleep(350);await retry(name,()=>getExistingDeployment(ethers.provider,records,name));}
 const [deployer]=await ethers.getSigners();
 if(!deployer)throw Error("AMOY_SECRET_KEY missing");
 const owner=process.env.ECHO_AMOY_OWNER_ADDRESS||deployer.address;
 const validator=process.env.ECHO_AMOY_VALIDATOR_ADDRESS||deployer.address;
 if(!ethers.isAddress(owner)||!ethers.isAddress(validator)||owner===ethers.ZeroAddress||validator===ethers.ZeroAddress)throw Error("Invalid owner or validator");
 const bridgeAddress=records.contracts.EchoAuthorizationBridgeV4;
 const bridge=await ethers.getContractAt("EchoAuthorizationBridgeV4",bridgeAddress);
 const dual=await ethers.getContractAt("EchoDualProofVerifierV4",records.contracts.EchoDualProofVerifierV4);
 const gateway=await ethers.getContractAt("EchoGeographicProofGatewayV4",records.contracts.EchoGeographicProofGatewayV4);
 const expectAddress=async(label,fn,want)=>{
  const actual=await retry(label,fn);
  if(actual.toLowerCase()!==want.toLowerCase())throw Error(label+" mismatch: "+actual);
 };
 await expectAddress("bridge registry",()=>bridge.checkpointRegistry(),records.contracts.EchoAttestationRegistryV3);
 await expectAddress("bridge dual",()=>bridge.dualProofVerifier(),records.contracts.EchoDualProofVerifierV4);
 await expectAddress("dual gateway",()=>dual.v4Gateway(),records.contracts.EchoGeographicProofGatewayV4);
 await expectAddress("gateway policy",()=>gateway.policyRegistry(),records.contracts.EchoGeographicPolicyRegistryV4);
 const zone=[100050n,100050n,200000n,200000n],drift=3600n;
 const factory=await ethers.getContractFactory("EchoSmartAccountV4Bootstrapped");
 const tx=await factory.getDeployTransaction(owner,ethers.ZeroAddress,bridgeAddress,validator,zone,drift);
 console.log("Existing original account PRESERVED:",records.contracts.EchoSmartAccountV4);
 console.log("Proposed new account owner:",owner,"validator:",validator);
 console.log("Simulating constructor...");
 await retry("constructor simulation",()=>ethers.provider.call({from:deployer.address,data:tx.data,gasLimit:12000000n}));
 console.log("SIMULATION PASS");
 if(process.env.CONFIRM_ECHO_ACCOUNT_ONLY_DEPLOY!=="YES"){
  console.log("DRY RUN ONLY. No transactions broadcast. Explicit opt-in required for account-only deployment.");
  return;
 }
 const filename=path.join(process.cwd(),"deployments/amoy/echo-v4-bootstrapped-account.json");
 if(fs.existsSync(filename))throw Error("Existing bootstrap record found; refusing duplicate deployment: "+filename);
 const contract=await factory.deploy(owner,ethers.ZeroAddress,bridgeAddress,validator,zone,drift);
 console.log("Broadcast transaction:",contract.deploymentTransaction().hash);
 await contract.waitForDeployment();
 const address=await contract.getAddress();
 const registry=await ethers.getContractAt("EchoAttestationRegistryV3",records.contracts.EchoAttestationRegistryV3);
 const geo=await ethers.getContractAt("EchoGeographicPolicyRegistryV4",records.contracts.EchoGeographicPolicyRegistryV4);
 const checks=[
  ["owner",await retry("owner",()=>contract.owner()),owner],
  ["bridge",await retry("account bridge",()=>contract.authorizationBridge()),bridgeAddress]
 ];
 for(const [label,actual,want] of checks)if(actual.toLowerCase()!==want.toLowerCase())throw Error(label+" mismatch");
 if(!await retry("authorized bridge",()=>registry.authorizedCheckpointBridges(address,bridgeAddress)))throw Error("Bridge not authorized for new account");
 if(!await retry("trusted validator",()=>registry.trustedValidatorSigners(address,validator)))throw Error("Validator not trusted for new account");
 const policy=await retry("attestation policy",()=>registry.attestationPolicies(address,address));
 const geographic=await retry("geographic policy",()=>geo.getGeographicPolicy(address,address));
 if(!policy.enabled||!geographic.enabled||policy.allowedZoneHash!==geographic.zoneHash)throw Error("Bootstrap policy mismatch");
 const receipt=await retry("deployment receipt",()=>ethers.provider.getTransactionReceipt(contract.deploymentTransaction().hash));
 const record={chainId:80002,contract:"EchoSmartAccountV4Bootstrapped",address,transactionHash:contract.deploymentTransaction().hash,blockNumber:receipt?.blockNumber??null,owner,validator,authorizationBridge:bridgeAddress,originalAccountPreserved:records.contracts.EchoSmartAccountV4,bootstrapVerified:true,proofExecutionVerified:false};
 fs.mkdirSync(path.dirname(filename),{recursive:true});
 fs.writeFileSync(filename,JSON.stringify(record,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log("ACCOUNT-ONLY DEPLOYMENT VERIFIED:",address);
 console.log("Saved:",filename);
 console.log("Real proof execution NOT YET verified.");
}
main().catch(e=>{console.error(e);process.exitCode=1});
