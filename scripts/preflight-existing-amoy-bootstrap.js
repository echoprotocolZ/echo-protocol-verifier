// Read-only Amoy preflight for deploying ONLY a new bootstrapped account.
// No transaction broadcast, no state changes, no gas spent.
// Run: npx hardhat run scripts/preflight-existing-amoy-bootstrap.js --network amoy
const {ethers,network}=require("hardhat");
const {loadRecords,getExistingDeployment}=require("./amoy-deployment-records");
const REQUIRED=["EchoAttestationRegistryV3","EchoAuthorizationVerifierV3","EchoAuthorizationBridgeV3","EchoGeographicPolicyRegistryV4","EchoGeographicBoundVerifierV4","EchoGeographicProofGatewayV4","EchoDualProofVerifierV4","EchoAuthorizationBridgeV4"];
async function main(){
 if(network.name!=="amoy"||(await ethers.provider.getNetwork()).chainId!==80002n)throw Error("Amoy only");
 const records=loadRecords();
 for(const name of REQUIRED)await getExistingDeployment(ethers.provider,records,name);
 const bridgeAddress=records.contracts.EchoAuthorizationBridgeV4;
 const registry=await ethers.getContractAt("EchoAttestationRegistryV3",records.contracts.EchoAttestationRegistryV3);
 const bridge=await ethers.getContractAt("EchoAuthorizationBridgeV4",bridgeAddress);
 const dual=await ethers.getContractAt("EchoDualProofVerifierV4",records.contracts.EchoDualProofVerifierV4);
 const gateway=await ethers.getContractAt("EchoGeographicProofGatewayV4",records.contracts.EchoGeographicProofGatewayV4);
 if((await bridge.checkpointRegistry()).toLowerCase()!==records.contracts.EchoAttestationRegistryV3.toLowerCase())throw Error("Bridge registry mismatch");
 if((await bridge.dualProofVerifier()).toLowerCase()!==records.contracts.EchoDualProofVerifierV4.toLowerCase())throw Error("Bridge dual verifier mismatch");
 if((await dual.v4Gateway()).toLowerCase()!==records.contracts.EchoGeographicProofGatewayV4.toLowerCase())throw Error("Dual gateway mismatch");
 if((await gateway.policyRegistry()).toLowerCase()!==records.contracts.EchoGeographicPolicyRegistryV4.toLowerCase())throw Error("Gateway policy registry mismatch");
 const [deployer]=await ethers.getSigners();
 if(!deployer)throw Error("AMOY_SECRET_KEY required for simulation; no transaction will be sent");
 const owner=process.env.ECHO_AMOY_OWNER_ADDRESS||deployer.address;
 const validator=process.env.ECHO_AMOY_VALIDATOR_ADDRESS||deployer.address;
 for(const [label,address] of [["owner",owner],["validator",validator]]){
  if(!ethers.isAddress(address)||address===ethers.ZeroAddress)throw Error("Invalid "+label);
 }
 const zone=[100050n,100050n,200000n,200000n];
 const factory=await ethers.getContractFactory("EchoSmartAccountV4Bootstrapped");
 const tx=await factory.getDeployTransaction(owner,ethers.ZeroAddress,bridgeAddress,validator,zone,3600n);
 console.log("Preflight deployer:",deployer.address);
 console.log("Existing bridge:",bridgeAddress);
 console.log("Proposed owner:",owner);
 console.log("Proposed validator:",validator);
 console.log("Existing checkpoint registry owner:",await registry.owner());
 console.log("Simulating account constructor using eth_call (no broadcast)...");
 try{
  await ethers.provider.call({from:deployer.address,data:tx.data,gasLimit:12000000n});
  console.log("PREFLIGHT PASS: constructor simulation completed against existing Amoy contracts");
 }catch(e){
  console.error("PREFLIGHT BLOCKED: constructor simulation failed; do NOT deploy.");
  console.error(e.shortMessage||e.reason||e.message);
  process.exitCode=1;
 }
 console.log("No transactions broadcast. Existing deployment record unchanged.");
}
main().catch(e=>{console.error(e);process.exitCode=1});
