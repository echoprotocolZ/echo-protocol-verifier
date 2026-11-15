#!/usr/bin/env node
"use strict";
// Amoy-only: sign a checkpoint for the ORIGINAL V4 account, never broadcast.
// Does not alter the existing bootstrapped-account checkpoint.
const fs=require("node:fs"),path=require("node:path"),hre=require("hardhat");
const {loadRecords}=require("./amoy-deployment-records");
async function main(){
 if(hre.network.name!=="amoy"||(await hre.ethers.provider.getNetwork()).chainId!==80002n)throw Error("Amoy network required");
 const r=loadRecords().contracts,dir="build/v4-geographic-bound/proofs";
 const load=name=>JSON.parse(fs.readFileSync(path.join(dir,name),"utf8"));
 const input=load("v3-amoy-authorization-input.json");
 const signals=load("v3-amoy-matching-public.json");
 const v4=load("approved-zone-public.json");
 const old=load("v4-signed-checkpoint.json");
 const account=r.EchoSmartAccountV4;
 const eq=(a,b)=>BigInt(a)===BigInt(b);
 if(signals.length!==20||v4.length!==5)throw Error("Wrong public signal lengths");
 if(!eq(signals[3],account)||!eq(input.account,account))throw Error("Proof account mismatch");
 if(!eq(signals[18],v4[4])||!eq(signals[18],input.expectedCheckpointCommitment))throw Error("Checkpoint proof mismatch");
 if(!eq(signals[1],input.expectedAuthorizationCommitment))throw Error("Authorization commitment mismatch");
 if(!eq(signals[11],input.nonce))throw Error("Proof nonce mismatch");
 if(!eq(signals[4],input.delegatee)||!eq(signals[5],input.validator))throw Error("Delegatee/validator mismatch");
 const nonce=await new hre.ethers.Contract(account,["function nonce() view returns (uint256)"],hre.ethers.provider).nonce();
 if(!eq(nonce,input.nonce))throw Error("On-chain nonce changed; regenerate witness and proof");
 const block=await hre.ethers.provider.getBlock("latest");
 if(!block||BigInt(block.timestamp)>=BigInt(signals[12]))throw Error("Proof expired; regenerate witness and proof");
 const signer=(await hre.ethers.getSigners())[0];
 if(!signer||!eq(signer.address,input.validator))throw Error("Configured signer does not match V3 validator");
 if(!old.checkpoint?.zoneHash||!hre.ethers.isHexString(old.checkpoint.zoneHash,32))throw Error("Missing valid zoneHash; verify geographic policy before execution");
 const checkpoint={
  account:hre.ethers.getAddress(account),
  delegatee:hre.ethers.getAddress(hre.ethers.toBeHex(BigInt(signals[4]),20)),
  zoneHash:old.checkpoint.zoneHash,
  checkpointCommitment:hre.ethers.toBeHex(BigInt(signals[18]),32),
  authorizationCommitment:hre.ethers.toBeHex(BigInt(signals[1]),32),
  timestamp:BigInt(input.checkpointTimestamp),
  nonce
 };
 if(!eq(signals[19],checkpoint.timestamp))throw Error("V3 timestamp mismatch");
 const registry=new hre.ethers.Contract(r.EchoAttestationRegistryV3,[
  "function checkpointDigest((address account,address delegatee,bytes32 zoneHash,bytes32 checkpointCommitment,bytes32 authorizationCommitment,uint64 timestamp,uint256 nonce)) view returns (bytes32)"
 ],hre.ethers.provider);
 const digest=await registry.checkpointDigest(checkpoint);
 const keys=hre.network.config.accounts;
 if(!Array.isArray(keys)||!keys.length)throw Error("Configured Amoy signing key unavailable");
 const wallet=new hre.ethers.Wallet(keys[0]);
 if(wallet.address.toLowerCase()!==signer.address.toLowerCase())throw Error("Configured key mismatch");
 const signature=wallet.signingKey.sign(digest).serialized;
 if(hre.ethers.recoverAddress(digest,signature).toLowerCase()!==signer.address.toLowerCase())throw Error("Signature recovery failed");
 const out=path.join(dir,"v4-signed-checkpoint-original-account.json");
 fs.writeFileSync(out,JSON.stringify({checkpoint:{...checkpoint,timestamp:checkpoint.timestamp.toString(),nonce:checkpoint.nonce.toString()},signature},null,2),{mode:0o600,flag:"wx"});
 console.log("SIGNED ORIGINAL ACCOUNT CHECKPOINT: "+out);
 console.log("Account:",checkpoint.account,"Nonce:",checkpoint.nonce.toString());
 console.log("Validator:",signer.address);
 console.log("Checkpoint digest:",digest);
 console.log("Zone hash copied from prior fixture; policy compatibility UNVERIFIED.");
 console.log("No transaction broadcast. No existing checkpoint overwritten.");
 console.log("Next: read-only verification of zone policy and bridge signature.");
}
main().catch(e=>{console.error("BLOCKED:",e.shortMessage||e.message);process.exitCode=1});
