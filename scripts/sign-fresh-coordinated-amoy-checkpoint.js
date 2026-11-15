#!/usr/bin/env node
"use strict";
// Sign the most recent fresh dual-proof checkpoint for the original Amoy account.
// No broadcasts; preserves previous signed checkpoint fixtures.
const fs=require("node:fs"),path=require("node:path"),hre=require("hardhat");
const {loadRecords}=require("./amoy-deployment-records");
async function main(){
 if(hre.network.name!=="amoy")throw Error("Amoy only");
 const {ethers}=hre;
 if((await ethers.provider.getNetwork()).chainId!==80002n)throw Error("Wrong network");
 const r=loadRecords().contracts,dir="build/v4-geographic-bound/proofs";
 const names=fs.readdirSync(dir).filter(n=>/^fresh-\d+-nonce-\d+-v3-input\.json$/.test(n)).sort((a,b)=>Number(b.match(/^fresh-(\d+)/)[1])-Number(a.match(/^fresh-(\d+)/)[1]));
 if(!names.length)throw Error("No fresh proof bundle found");
 const prefix=names[0].replace(/-v3-input\.json$/,"");
 const read=s=>JSON.parse(fs.readFileSync(path.join(dir,prefix+s),"utf8"));
 const input=read("-v3-input.json"),v3=read("-v3-public.json"),v4=read("-v4-public.json");
 const eq=(a,b)=>BigInt(a)===BigInt(b);
 const account=r.EchoSmartAccountV4;
 if(v3.length!==20||v4.length!==5||!eq(v3[3],account)||!eq(input.account,account)||!eq(v3[18],v4[4])||!eq(v3[18],input.expectedCheckpointCommitment)||!eq(v3[1],input.expectedAuthorizationCommitment)||!eq(v3[11],input.nonce)||!eq(v3[19],input.checkpointTimestamp))throw Error("Fresh proof bindings invalid");
 const nonce=await new ethers.Contract(account,["function nonce() view returns (uint256)"],ethers.provider).nonce();
 const block=await ethers.provider.getBlock("latest");
 if(!eq(nonce,v3[11]))throw Error("Nonce changed; regenerate proofs");
 if(!block||BigInt(block.timestamp)>=BigInt(v3[12]))throw Error("Authorization expired; regenerate proofs");
 const old=JSON.parse(fs.readFileSync(path.join(dir,"v4-signed-checkpoint-original-account.json"),"utf8"));
 const zoneHash=old.checkpoint.zoneHash;
 const delegatee=ethers.getAddress(ethers.toBeHex(BigInt(v3[4]),20));
 const policyRegistry=new ethers.Contract(r.EchoAttestationRegistryV3,[
  "function checkpointDigest((address account,address delegatee,bytes32 zoneHash,bytes32 checkpointCommitment,bytes32 authorizationCommitment,uint64 timestamp,uint256 nonce)) view returns (bytes32)",
  "function attestationPolicies(address,address) view returns (bytes32 allowedZoneHash,uint64 maxTimeDrift,uint8 requiredTier,bool allowValidatorFallback,bool enabled)",
  "function trustedValidatorSigners(address,address) view returns (bool)"
 ],ethers.provider);
 const policy=await policyRegistry.attestationPolicies(account,delegatee);
 if(!policy.enabled||policy.allowedZoneHash.toLowerCase()!==zoneHash.toLowerCase()||Number(policy.requiredTier)!==0)throw Error("Attestation policy mismatch");
 if(BigInt(block.timestamp)<BigInt(v3[19])||BigInt(block.timestamp)-BigInt(v3[19])>BigInt(policy.maxTimeDrift))throw Error("Checkpoint already outside attestation policy time drift; regenerate proofs immediately");
 const signer=(await ethers.getSigners())[0];
 if(!signer||!eq(signer.address,v3[5])||!(await policyRegistry.trustedValidatorSigners(account,signer.address)))throw Error("Validator not configured/trusted");
 const keys=hre.network.config.accounts;
 if(!Array.isArray(keys)||!keys.length)throw Error("Configured signing key unavailable");
 const wallet=new ethers.Wallet(keys[0]);
 if(wallet.address.toLowerCase()!==signer.address.toLowerCase())throw Error("Signer key mismatch");
 const checkpoint={account:ethers.getAddress(account),delegatee,zoneHash,checkpointCommitment:ethers.toBeHex(BigInt(v3[18]),32),authorizationCommitment:ethers.toBeHex(BigInt(v3[1]),32),timestamp:BigInt(v3[19]),nonce};
 const digest=await policyRegistry.checkpointDigest(checkpoint);
 const signature=wallet.signingKey.sign(digest).serialized;
 if(ethers.recoverAddress(digest,signature).toLowerCase()!==wallet.address.toLowerCase())throw Error("Signature recovery mismatch");
 const out=path.join(dir,prefix+"-signed-checkpoint.json");
 fs.writeFileSync(out,JSON.stringify({checkpoint:{...checkpoint,timestamp:checkpoint.timestamp.toString(),nonce:checkpoint.nonce.toString()},signature},null,2)+"\n",{flag:"wx",mode:0o600});
 console.log("SUCCESS: fresh checkpoint signed and attestation timestamp policy passed");
 console.log("Bundle:",prefix);
 console.log("Signed checkpoint:",out);
 console.log("Validator:",wallet.address);
 console.log("Block timestamp:",block.timestamp,"maxTimeDrift:",policy.maxTimeDrift.toString());
 console.log("Geographic policy and bridge execution still require separate checks.");
 console.log("Transaction broadcast: NO; POL spent: 0");
}
main().catch(e=>{console.error("BLOCKED:",e.shortMessage||e.message);process.exitCode=1});
