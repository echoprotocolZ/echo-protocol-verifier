// Polygon Amoy rehearsal: deploy the complete real-verifier dependency graph,
// constructor-bootstrap one account, and assert every connection on-chain.
// NO mainnet support. Does NOT transfer tokens or grant allowances.
// Run: npx hardhat run scripts/deploy-amoy-v4-bootstrap.js --network amoy
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {ethers,network}=require("hardhat");

async function main(){
 if(network.name!=="amoy" || (await ethers.provider.getNetwork()).chainId!==80002n)
  throw Error("AMOY ONLY: wrong Hardhat network or chain ID");
 if(process.env.ECHO_CONFIRM_AMOY_DEPLOY!=="YES")
  throw Error("Set ECHO_CONFIRM_AMOY_DEPLOY=YES to authorize testnet gas expenditure");
 const [deployer]=await ethers.getSigners();
 if(!deployer)throw Error("AMOY_SECRET_KEY missing");
 const validator=process.env.ECHO_AMOY_VALIDATOR_ADDRESS;
 const owner=process.env.ECHO_AMOY_OWNER_ADDRESS;
 if(!validator||!ethers.isAddress(validator)||validator===ethers.ZeroAddress)throw Error("Set ECHO_AMOY_VALIDATOR_ADDRESS");
 if(!owner||!ethers.isAddress(owner)||owner===ethers.ZeroAddress)throw Error("Set ECHO_AMOY_OWNER_ADDRESS");
 const balance=await ethers.provider.getBalance(deployer.address);
 if(balance===0n)throw Error("Deployer has no Amoy test MATIC/POL");
 console.log("Amoy deployer:",deployer.address,"balance:",ethers.formatEther(balance));
 async function deploy(name,...args){
  const contract=await(await ethers.getContractFactory(name)).deploy(...args);
  await contract.waitForDeployment();
  const address=await contract.getAddress();
  assert.notEqual(await ethers.provider.getCode(address),"0x");
  console.log(name,address);
  return contract;
 }
 const registry=await deploy("EchoAttestationRegistryV3");
 const v3Verifier=await deploy("EchoAuthorizationVerifierV3");
 const v3Bridge=await deploy("EchoAuthorizationBridgeV3",v3Verifier.target,registry.target);
 const geoPolicy=await deploy("EchoGeographicPolicyRegistryV4");
 const v4Verifier=await deploy("EchoGeographicBoundVerifierV4");
 const geoGateway=await deploy("EchoGeographicProofGatewayV4",v4Verifier.target,geoPolicy.target);
 const dual=await deploy("EchoDualProofVerifierV4",v3Bridge.target,geoGateway.target);
 const bridge=await deploy("EchoAuthorizationBridgeV4",dual.target,registry.target);
 const zone=[100050n,100050n,200000n,200000n];
 const account=await deploy("EchoSmartAccountV4Bootstrapped",owner,ethers.ZeroAddress,bridge.target,validator,zone,3600n);
 assert.equal(await account.owner(),ethers.getAddress(owner));
 assert.equal(await account.authorizationBridge(),bridge.target);
 assert.equal(await bridge.checkpointRegistry(),registry.target);
 assert.equal(await bridge.dualProofVerifier(),dual.target);
 assert.equal(await dual.v3Bridge(),v3Bridge.target);
 assert.equal(await dual.v4Gateway(),geoGateway.target);
 assert.equal(await geoGateway.policyRegistry(),geoPolicy.target);
 assert.equal(await registry.authorizedCheckpointBridges(account.target,bridge.target),true);
 assert.equal(await registry.trustedValidatorSigners(account.target,validator),true);
 const attestation=await registry.attestationPolicies(account.target,account.target);
 const geographic=await geoPolicy.getGeographicPolicy(account.target,account.target);
 assert.equal(attestation.enabled,true);
 assert.equal(geographic.enabled,true);
 assert.equal(attestation.allowedZoneHash,geographic.zoneHash);
 const addresses={registry:registry.target,v3Verifier:v3Verifier.target,v3Bridge:v3Bridge.target,
  geoPolicy:geoPolicy.target,v4Verifier:v4Verifier.target,geoGateway:geoGateway.target,
  dualVerifier:dual.target,authorizationBridge:bridge.target,smartAccount:account.target};
 const out={network:"polygon-amoy",chainId:80002,deployer:deployer.address,
  owner:ethers.getAddress(owner),validator:ethers.getAddress(validator),
  addresses,bootstrapVerified:true,proofExecutionVerified:false,
  note:"Constructor bootstrap only; real on-chain Groth16 execution not yet demonstrated."};
 const filename=path.join(process.cwd(),"amoy-v4-bootstrap-deployment.json");
 fs.writeFileSync(filename,JSON.stringify(out,null,2)+"\n",{flag:"wx"});
 console.log("BOOTSTRAP VERIFIED; proof execution NOT YET VERIFIED");
 console.log("Saved",filename);
}
main().catch(err=>{console.error(err);process.exitCode=1});
