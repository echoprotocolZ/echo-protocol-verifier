#!/usr/bin/env node
"use strict";
// Read-only token identity/supply and explicitly named wallet balance check.
// Usage: POLYGON_RPC_URL=https://... node scripts/audit-echo-token-supply-readonly.js [wallet...]
// Never signs or sends transactions. Do not interpret a token's totalSupply as circulating supply.
const { ethers } = require("ethers");
const MAINNET = 137n;
const TOKENS = [
  { label: "Designated ECHO", address: "0x9511Ee84398B8Deb725d8967c16693C96C43e0eD" },
  { label: "Reported second deployment", address: "0x5C2933c98a871F14329E028e22AE39Eb7A70A6Cc" }
];
const abi = [
  "function name() view returns(string)",
  "function symbol() view returns(string)",
  "function decimals() view returns(uint8)",
  "function totalSupply() view returns(uint256)",
  "function balanceOf(address) view returns(uint256)",
  "function owner() view returns(address)"
];
async function main() {
  if (!process.env.POLYGON_RPC_URL) throw Error("Set POLYGON_RPC_URL to a trusted Polygon mainnet RPC URL");
  const wallets = process.argv.slice(2);
  if (wallets.some(w => !ethers.isAddress(w))) throw Error("Invalid wallet address supplied");
  const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL, 137, { staticNetwork: true, batchMaxCount: 1 });
  try {
    const network = await provider.getNetwork();
    if (network.chainId !== MAINNET || BigInt(await provider.send("eth_chainId", [])) !== MAINNET) throw Error("RPC is not Polygon mainnet (137)");
    const block = await provider.getBlockNumber();
    console.log("Network: Polygon mainnet (137); snapshot block:", block);
    for (const item of TOKENS) {
      console.log("\nContract:", item.label, item.address);
      const code = await provider.getCode(item.address, block);
      if (code === "0x") { console.log("NO CONTRACT CODE at snapshot block"); continue; }
      console.log("Runtime keccak256:", ethers.keccak256(code));
      const token = new ethers.Contract(item.address, abi, provider);
      for (const method of ["name", "symbol", "decimals", "totalSupply", "owner"]) {
        try {
          const value = await token[method].staticCall({ blockTag: block });
          console.log(method + ":", method === "totalSupply" ? value.toString() + " raw units" : String(value));
        } catch (e) { console.log(method + ": unavailable (" + (e.shortMessage || e.message) + ")"); }
      }
      let decimals;
      try { decimals = await token.decimals.staticCall({ blockTag: block }); } catch {}
      if (decimals !== undefined) {
        try { console.log("Total supply formatted:", ethers.formatUnits(await token.totalSupply.staticCall({ blockTag: block }), decimals)); } catch {}
      }
      for (const wallet of wallets) {
        try {
          const balance = await token.balanceOf.staticCall(wallet, { blockTag: block });
          console.log("Wallet", wallet, "balance:", balance.toString(), "raw units", decimals === undefined ? "" : "(" + ethers.formatUnits(balance, decimals) + ")");
        } catch (e) { console.log("Wallet", wallet, "balance unavailable:", e.shortMessage || e.message); }
      }
    }
    console.log("\nLIMITATION: Supplied wallet balances are not a complete holder census. This script does not establish circulating supply, available allocation balances, verified source equivalence, or ownership of any wallet.");
    console.log("No transactions broadcast. No POL spent.");
  } finally { provider.destroy(); }
}
main().catch(e => { console.error("READ-ONLY AUDIT BLOCKED:", e.message); process.exitCode = 1; });
