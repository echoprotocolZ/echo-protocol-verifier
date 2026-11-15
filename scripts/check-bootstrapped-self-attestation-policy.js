"use strict";
// Read-only inspection of exact bootstrapped attestation policy.
// Correct Solidity public mapping getter: attestationPolicies(account, delegatee).
const fs=require("node:fs");
const {ethers}=require("ethers");
(async()=>{
 const d=JSON.parse(fs.readFileSync("deployments/amoy/echo-v4-bootstrapped-account.json","utf8"));
 if(Number(d.chainId)!==80002)throw Error("Amoy only");
 const url=process.env.AMOY_RPC_URL||"https://polygon-amoy-bor-rpc.publicnode.com";
 const provider=new ethers.JsonRpcProvider(url,80002,{staticNetwork:true,batchMaxCount:1});
 if(BigInt(await provider.send("eth_chainId",[]))!==80002n)throw Error("Wrong RPC chain");
 const bridge=new ethers.Contract(d.authorizationBridge,["function checkpointRegistry() view returns(address)"],provider);
 const registryAddress=await bridge.checkpointRegistry();
 const registry=new ethers.Contract(registryAddress,[
 "function attestationPolicies(address,address) view returns(bytes32 allowedZoneHash,uint64 maxTimeDrift,uint8 requiredTier,bool allowValidatorFallback,bool enabled)",
 "function trustedValidatorSigners(address,address) view returns(bool)",
 "function authorizedCheckpointBridges(address,address) view returns(bool)",
 "function consumedCheckpointNonces(address,address,uint256) view returns(bool)"
 ],provider);
 const account=d.address,validator=d.owner,nonce=0n;
 const [policy,trusted,bridgeApproved,consumed]=await Promise.all([
 registry.attestationPolicies(account,account),
 registry.trustedValidatorSigners(account,validator),
 registry.authorizedCheckpointBridges(account,d.authorizationBridge),
 registry.consumedCheckpointNonces(account,account,nonce)
 ]);
 console.log("=== BOOTSTRAPPED SELF-DELEGATED POLICY (READ ONLY) ===");
 console.log("Account:",account);
 console.log("Registry:",registryAddress);
 console.log("Allowed zone hash:",policy.allowedZoneHash);
 console.log("Max time drift seconds:",policy.maxTimeDrift.toString());
 console.log("Required tier (0=ValidatorOnly):",policy.requiredTier.toString());
 console.log("Validator fallback:",policy.allowValidatorFallback);
 console.log("Policy enabled:",policy.enabled);
 console.log("Owner trusted validator:",trusted);
 console.log("Bridge authorized:",bridgeApproved);
 console.log("Self-delegated nonce 0 consumed:",consumed);
 console.log("READ ONLY: no signatures, proof writes or transactions");
 if(!policy.enabled||!trusted||!bridgeApproved||consumed||Number(policy.requiredTier)!==0)process.exitCode=2;
})().catch(e=>{console.error("POLICY CHECK ERROR:",e.shortMessage||e.message);process.exitCode=1});
