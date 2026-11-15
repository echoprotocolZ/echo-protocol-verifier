"use strict";
// Read-only inspection of the bootstrapped V4 account's existing policy.
// Does not change permissions, sign, create proofs, or broadcast.
const fs = require("node:fs");
const { ethers } = require("ethers");
const file = "deployments/amoy/echo-v4-bootstrapped-account.json";
async function main() {
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Number(d.chainId) !== 80002) throw Error("Amoy deployment required");
  const account = ethers.getAddress(d.address);
  const bridgeAddress = ethers.getAddress(d.authorizationBridge);
  const urls = [...new Set([process.env.AMOY_RPC_URL, "https://polygon-amoy-bor-rpc.publicnode.com", "https://rpc-amoy.polygon.technology"].filter(Boolean))];
  let provider;
  for (const url of urls) {
    try {
      const p = new ethers.JsonRpcProvider(url, 80002, {staticNetwork:true,batchMaxCount:1});
      const id = await Promise.race([p.send("eth_chainId",[]),new Promise((_,reject)=>setTimeout(()=>reject(Error("probe timeout")),8000))]);
      if (BigInt(id) !== 80002n) throw Error("Wrong chain");
      provider = p; console.log("RPC:",new URL(url).host);break;
    } catch(e) { console.log("RPC unavailable:",new URL(url).host,e.shortMessage||e.message); }
  }
  if (!provider) throw Error("No working Amoy RPC");
  const contract = (address,abi) => new ethers.Contract(address,abi,provider);
  const bridge = contract(bridgeAddress,[
    "function dualProofVerifier() view returns (address)",
    "function checkpointRegistry() view returns (address)",
    "function authorizedDelegatees(address,address) view returns (bool)"
  ]);
  const dualAddress = await bridge.dualProofVerifier();
  const registryAddress = await bridge.checkpointRegistry();
  const dual = contract(dualAddress,["function v4Gateway() view returns (address)"]);
  const gatewayAddress = await dual.v4Gateway();
  const gateway = contract(gatewayAddress,["function policyRegistry() view returns (address)"]);
  const geoAddress = await gateway.policyRegistry();
  const geo = contract(geoAddress,[
    "function getGeographicPolicy(address,address) view returns ((uint32 minLat,uint32 maxLat,uint32 minLon,uint32 maxLon),bytes32,bool)"
  ]);
  const registry = contract(registryAddress,[
    "function getAttestationPolicy(address) view returns ((bytes32 allowedZoneHash,uint64 maxTimeDrift,uint8 requiredTier,bool allowValidatorFallback,bool enabled))"
  ]);
  const accountContract = contract(account,["function nonce() view returns (uint256)","function owner() view returns (address)"]);
  const [nonce,owner,selfZone,selfAllowed] = await Promise.all([
    accountContract.nonce(),accountContract.owner(),geo.getGeographicPolicy(account,account),bridge.authorizedDelegatees(account,account)
  ]);
  const checkpoint=JSON.parse(fs.readFileSync("build/v4-geographic-bound/proofs/v4-signed-checkpoint.json","utf8")).checkpoint;
  const v3=JSON.parse(fs.readFileSync("build/v4-geographic-bound/proofs/v3-amoy-matching-public.json","utf8"));
  console.log("=== BOOTSTRAPPED V4 POLICY INSPECTION ===");
  console.log("Account:",account,"Owner:",owner,"Nonce:",nonce.toString());
  console.log("Bridge:",bridgeAddress,"Registry:",registryAddress);
  console.log("Gateway:",gatewayAddress,"Geographic registry:",geoAddress);
  console.log("Self-delegated zone enabled:",selfZone[2]);
  console.log("Self-delegated zone hash:",selfZone[1]);
  console.log("Self-delegated zone bounds:",[...selfZone[0]].map(String).join(","));
  console.log("Self-delegation needs bridge allowlist:",false);
  console.log("Saved V3 account matches:",BigInt(v3[3])===BigInt(account));
  console.log("Saved checkpoint delegatee self:",checkpoint.delegatee.toLowerCase()===account.toLowerCase());
  console.log("Saved V3 deadline:",String(v3[12]));
  try {
    const policy = await registry.getAttestationPolicy(account);
    console.log("Attestation policy:",JSON.stringify(policy,(_,v)=>typeof v==="bigint"?v.toString():v));
  } catch(e) { console.log("Attestation policy getter unavailable:",e.shortMessage||e.message); }
  console.log("READ ONLY: no signing, writes or transactions");
}
main().catch(e=>{console.error("POLICY INSPECTION ERROR:",e.shortMessage||e.message);process.exitCode=1});
