"use strict";
// Read-only Polygon Amoy authorization preflight. No signing, writes, or transactions.
const fs = require("node:fs");
const hre = require("hardhat");
const { loadRecords } = require("./amoy-deployment-records");

async function main() {
  if (hre.network.name !== "amoy") throw Error("Use --network amoy");
  // Probe endpoints independently. An RPC timeout must not be treated as a proof failure.
  // Optional AMOY_RPC_URL can point to a user-configured provider.
  const urls = [...new Set([
    process.env.AMOY_RPC_URL,
    "https://polygon-amoy-bor-rpc.publicnode.com",
    "https://rpc-amoy.polygon.technology",
    "https://polygon-amoy.drpc.org"
  ].filter(Boolean))];
  let provider, chain, lastError;
  for (const url of urls) {
    try {
      const candidate = new hre.ethers.JsonRpcProvider(url, 80002, {
        batchMaxCount: 1, staticNetwork: true
      });
      // Query eth_chainId explicitly: staticNetwork alone is not a network verification.
      const id = await Promise.race([
        candidate.send("eth_chainId", []),
        new Promise((_, reject) => setTimeout(() => reject(Error("RPC probe timeout")), 8000))
      ]);
      if (BigInt(id) !== 80002n) throw Error("RPC returned wrong chain ID");
      provider = candidate;
      chain = await candidate.getNetwork();
      console.log("RPC connected:", new URL(url).host);
      break;
    } catch (e) {
      lastError = e;
      console.log("RPC unavailable:", new URL(url).host, e.shortMessage || e.message);
    }
  }
  if (!provider) throw Error("All Amoy RPC endpoints failed: " + (lastError?.message || "unknown"));
  const address = loadRecords().contracts.EchoSmartAccountV4;
  if (!address || await provider.getCode(address) === "0x")
    throw Error("Smart account missing on Amoy");
  const account = new hre.ethers.Contract(
    address, ["function nonce() view returns (uint256)"], provider
  );
  const p = "build/v4-geographic-bound/proofs";
  const input = JSON.parse(fs.readFileSync(p + "/v3-amoy-authorization-input.json", "utf8"));
  const signed = JSON.parse(fs.readFileSync(p + "/v4-signed-checkpoint.json", "utf8"));
  const v4 = JSON.parse(fs.readFileSync(p + "/approved-zone-public.json", "utf8"));
  const [nonce, block] = await Promise.all([account.nonce(), provider.getBlock("latest")]);
  if (!block) throw Error("Latest Amoy block unavailable");
  const checkpoint = signed.checkpoint;
  const errors = [];
  const assert = (condition, message) => { if (!condition) errors.push(message); };
  const eq = (a,b) => BigInt(a) === BigInt(b);
  assert(eq(input.account, address), "V3 input account differs from deployed smart account");
  assert(eq(input.chainId, chain.chainId), "V3 input chain ID mismatch");
  assert(eq(input.nonce, nonce), "V3 input nonce is stale");
  assert(eq(checkpoint.nonce, nonce), "Signed checkpoint nonce is stale");
  assert(eq(checkpoint.nonce, input.nonce), "Signed checkpoint and V3 input nonces differ");
  assert(eq(checkpoint.account, address), "Signed checkpoint account differs from deployed account");
  assert(eq(checkpoint.authorizationCommitment, input.expectedAuthorizationCommitment), "Signed checkpoint authorization commitment differs from V3 input");
  assert(eq(checkpoint.delegatee, input.delegatee), "Signed checkpoint delegatee differs from V3 input");
  assert(eq(input.expectedCheckpointCommitment, checkpoint.checkpointCommitment), "V3 and signed checkpoint commitments differ");
  assert(eq(input.expectedCheckpointCommitment, v4[4]), "V3/V4 checkpoint commitments differ");
  assert(eq(input.checkpointTimestamp, checkpoint.timestamp), "V3 and signed checkpoint timestamps differ");
  assert(BigInt(input.deadline) > BigInt(block.timestamp), "V3 authorization deadline has expired");
  console.log("=== AMOY AUTHORIZATION PREFLIGHT (READ ONLY) ===");
  console.log("Account:", address);
  console.log("On-chain nonce:", nonce.toString());
  console.log("V3 input nonce:", input.nonce);
  console.log("Signed checkpoint nonce:", checkpoint.nonce);
  console.log("V3 input account:", hre.ethers.getAddress(hre.ethers.toBeHex(BigInt(input.account), 20)));
  console.log("Signed checkpoint account:", checkpoint.account);
  console.log("Checkpoint timestamp:", checkpoint.timestamp);
  console.log("Checkpoint delegatee:", checkpoint.delegatee);
  console.log("Amoy block timestamp:", block.timestamp);
  console.log("Authorization deadline:", input.deadline);
  console.log("Checks:", errors.length ? "BLOCKED" : "PASS");
  for (const issue of errors) console.log(" -", issue);
  console.log("Transactions broadcast: NO");
  if (errors.length) process.exitCode = 1;
}
main().catch(e => { console.error("PREFLIGHT ERROR:", e.shortMessage || e.message); process.exitCode = 1; });
