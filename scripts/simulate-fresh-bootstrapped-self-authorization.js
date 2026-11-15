"use strict";
// Fresh self-delegated Amoy authorization: generate both Groth16 proofs,
// verify them locally, and simulate. No artifacts overwritten or broadcasts.
const fs=require("node:fs");
const hre=require("hardhat");
const {buildPoseidon}=require("circomlibjs");
const {generateDualProof}=require("./zk/echo-z-proof-utils");
const {ethers}=hre;
const ACCOUNT="0xBbb493289FE2698D04a9EC05Fe9Dd1d400Bc418f";
const VALIDATOR="0xbD2dEf17C60C3f6C2dA6eE812F948f4B53f2f803";
const ZONE_HASH="0xc7a147d948d06c036bdc1f0eb63b71ca245a5289155e0e50977e755d9b05dbd7";
const POINT=Object.freeze({lat:100050n,lon:200000n});
const TYPES={SignedCheckpoint:[
{name:"account",type:"address"},{name:"delegatee",type:"address"},
{name:"zoneHash",type:"bytes32"},{name:"checkpointCommitment",type:"bytes32"},
{name:"authorizationCommitment",type:"bytes32"},{name:"timestamp",type:"uint64"},
{name:"nonce",type:"uint256"}]};
async function main(){
 if(hre.network.name!=="amoy"||(await ethers.provider.getNetwork()).chainId!==80002n)throw Error("Amoy only");
 const deployment=JSON.parse(fs.readFileSync("deployments/amoy/echo-v4-bootstrapped-account.json","utf8"));
 if(ethers.getAddress(deployment.address)!==ethers.getAddress(ACCOUNT))throw Error("Wrong bootstrap account");
 const [validator]=await ethers.getSigners();
 if(validator.address.toLowerCase()!==VALIDATOR.toLowerCase())throw Error("Unexpected signer");
 const account=await ethers.getContractAt("EchoSmartAccountV4Bootstrapped",ACCOUNT);
 const bridge=await ethers.getContractAt("EchoAuthorizationBridgeV4",await account.authorizationBridge());
 const registry=await ethers.getContractAt("EchoAttestationRegistryV3",await bridge.checkpointRegistry());
 const dual=await ethers.getContractAt("EchoDualProofVerifierV4",await bridge.dualProofVerifier());
 const gatewayAddress=await dual.v4Gateway();
 const gateway=new ethers.Contract(gatewayAddress,["function policyRegistry() view returns(address)"],ethers.provider);
 const geo=new ethers.Contract(await gateway.policyRegistry(),["function getGeographicPolicy(address,address) view returns((uint32 minLat,uint32 maxLat,uint32 minLon,uint32 maxLon),bytes32,bool)"],ethers.provider);
 const policy=await geo.getGeographicPolicy(ACCOUNT,ACCOUNT);
 if(!policy[2]||policy[1].toLowerCase()!==ZONE_HASH.toLowerCase()||
  BigInt(policy[0].minLat)!==POINT.lat||BigInt(policy[0].maxLat)!==POINT.lat||
  BigInt(policy[0].minLon)!==POINT.lon||BigInt(policy[0].maxLon)!==POINT.lon)throw Error("Geographic policy changed");
 const att=await registry.attestationPolicies(ACCOUNT,ACCOUNT);
 if(!att.enabled||att.allowedZoneHash.toLowerCase()!==ZONE_HASH.toLowerCase()||Number(att.requiredTier)!==0)throw Error("Attestation policy mismatch");
 if(!await registry.trustedValidatorSigners(ACCOUNT,VALIDATOR))throw Error("Validator not trusted");
 if(!await registry.authorizedCheckpointBridges(ACCOUNT,await account.authorizationBridge()))throw Error("Bridge not trusted");
 const nonce=await account.nonce();
 if(await registry.consumedCheckpointNonces(ACCOUNT,ACCOUNT,nonce))throw Error("Nonce consumed");
 const saved=JSON.parse(fs.readFileSync("build/v4-geographic-bound/proofs/v3-amoy-matching-public.json","utf8"));
 const target=ethers.getAddress(ethers.toBeHex(BigInt(saved[6]),20));
 const data=new ethers.Interface(["function setValue(uint256)"]).encodeFunctionData("setValue",[888n]);
 const value=0n;
 const base=JSON.parse(fs.readFileSync("build/v3-bound/input-local.json","utf8"));
 const latest=await ethers.provider.getBlock("latest");
 const timestamp=BigInt(latest.timestamp);
 const deadline=timestamp+1800n;
 const minTimestamp=timestamp-3600n,maxTimestamp=timestamp+3600n;
 const poseidon=await buildPoseidon();
 const hash=xs=>BigInt(poseidon.F.toString(poseidon(xs)));
 const fragmentPayload=BigInt(base.fragmentPayload),fragmentSalt=BigInt(base.fragmentSalt);
 const fragmentCommitment=hash([fragmentPayload,fragmentSalt]);
 const checkpointCommitment=hash([POINT.lat,POINT.lon,timestamp]);
 const calldataHash=BigInt(ethers.keccak256(data)),mask=(1n<<128n)-1n;
 const authorizationHash1=hash([BigInt(ACCOUNT),BigInt(ACCOUNT),BigInt(VALIDATOR),BigInt(target),value,calldataHash&mask,calldataHash>>128n,80002n,nonce,deadline,fragmentCommitment,POINT.lat,POINT.lon,0n,minTimestamp,maxTimestamp]);
 const authorizationCommitment=hash([authorizationHash1,checkpointCommitment]);
 const nullifier=hash([BigInt(ACCOUNT),authorizationCommitment]);
 const v3Input={expectedFragmentCommitment:fragmentCommitment,expectedCheckpointCommitment:checkpointCommitment,expectedCheckpointTimestamp:timestamp,expectedAuthorizationCommitment:authorizationCommitment,expectedNullifier:nullifier,account:BigInt(ACCOUNT),delegatee:BigInt(ACCOUNT),validator:BigInt(VALIDATOR),target:BigInt(target),value,calldataHashLow:calldataHash&mask,calldataHashHigh:calldataHash>>128n,chainId:80002n,nonce,deadline,targetX:POINT.lat,targetY:POINT.lon,maxDistanceSq:0n,minTimestamp,maxTimestamp,fragmentPayload,fragmentSalt,checkpointX:POINT.lat,checkpointY:POINT.lon,checkpointTimestamp:timestamp};
 const v4Input={checkpointLat:POINT.lat,checkpointLon:POINT.lon,checkpointTimestamp:timestamp,minLat:POINT.lat,maxLat:POINT.lat,minLon:POINT.lon,maxLon:POINT.lon,expectedCheckpointCommitment:checkpointCommitment};
 console.log("=== FRESH BOOTSTRAPPED SELF-DELEGATED V3/V4 ===");
 console.log("Account/delegatee:",ACCOUNT,"Validator:",VALIDATOR);
 console.log("Target:",target,"Nonce:",nonce.toString(),"Deadline:",deadline.toString());
 console.log("Generating and locally verifying dual proofs...");
 const proof=await generateDualProof(v3Input,v4Input);
 if(BigInt(proof.v3Signals[3])!==BigInt(ACCOUNT)||BigInt(proof.v3Signals[4])!==BigInt(ACCOUNT)||BigInt(proof.v3Signals[12])!==deadline||BigInt(proof.v3Signals[18])!==BigInt(proof.v4Signals[4]))throw Error("Generated public signals mismatch");
 const checkpoint={account:ACCOUNT,delegatee:ACCOUNT,zoneHash:ZONE_HASH,checkpointCommitment:ethers.toBeHex(checkpointCommitment,32),authorizationCommitment:ethers.toBeHex(authorizationCommitment,32),timestamp,nonce};
 const signature=await validator.signTypedData({name:"EchoAttestationRegistryV3",version:"1",chainId:80002n,verifyingContract:await bridge.checkpointRegistry()},TYPES,checkpoint);
 const digest=await registry.checkpointDigest(checkpoint);
 if(ethers.recoverAddress(digest,signature).toLowerCase()!==VALIDATOR.toLowerCase())throw Error("Checkpoint signature mismatch");
 console.log("Dual proof and checkpoint signature: PASS");
 console.log("Simulating executeAuthorized.staticCall...");
 try{
 const result=await account.connect(validator).executeAuthorized.staticCall(checkpoint,signature,proof.v3A,proof.v3B,proof.v3C,proof.v3Signals,proof.v4A,proof.v4B,proof.v4C,proof.v4Signals,target,value,data,{gasLimit:10000000n});
 console.log("FULL AUTHORIZATION SIMULATION: PASS",result);
 }catch(e){
 console.log("FULL AUTHORIZATION SIMULATION: REVERTED",e.shortMessage||e.message,"data:",e.data||"none");
 process.exitCode=1;
 }
 console.log("SIMULATION ONLY: no transaction broadcast; no files modified");
}
main().catch(e=>{console.error("ERROR:",e.shortMessage||e.message);process.exitCode=1});
