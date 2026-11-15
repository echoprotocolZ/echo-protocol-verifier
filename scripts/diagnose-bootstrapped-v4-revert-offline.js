#!/usr/bin/env node
"use strict";
// Offline-only diagnostic for the bootstrapped V4 authorization simulation.
// No RPC, keys, signing, proof writes, or transactions.
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const selector = (process.argv[2] || "0x157a3759").toLowerCase();
if (!/^0x[0-9a-f]{8}$/.test(selector)) throw Error("Expected 4-byte revert selector");
const roots = ["artifacts", "artifacts-production-comparison"];
const matches = new Set();
let inspected = 0;
function walk(p) {
  if (!fs.existsSync(p)) return;
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!entry.name.endsWith(".json") || entry.name.endsWith(".dbg.json")) continue;
    try {
      const obj = JSON.parse(fs.readFileSync(full, "utf8"));
      if (!Array.isArray(obj.abi)) continue;
      inspected++;
      for (const fragment of obj.abi) {
        if (fragment.type !== "error") continue;
        const signature = ethers.ErrorFragment.from(fragment).format("sighash");
        if (ethers.id(signature).slice(0, 10).toLowerCase() === selector)
          matches.add(signature + " (" + full + ")");
      }
    } catch (_) { /* skip non-ABI JSON */ }
  }
}
for (const root of roots) walk(root);
console.log("=== ECHO V4 OFFLINE REVERT DIAGNOSTIC ===");
console.log("Revert selector:", selector);
console.log("ABI files inspected:", inspected);
console.log("Matching errors:", matches.size ? [...matches].join("\n  ") : "NOT FOUND");
const base = "build/v4-geographic-bound/proofs";
const read = file => JSON.parse(fs.readFileSync(path.join(base, file), "utf8"));
const checkpoint = read("v4-signed-checkpoint.json").checkpoint;
const input = read("v3-amoy-authorization-input.json");
const v3 = read("v3-amoy-matching-public.json");
const bootstrap = JSON.parse(fs.readFileSync("deployments/amoy/echo-v4-bootstrapped-account.json", "utf8"));
const same = (a,b) => BigInt(a) === BigInt(b);
console.log("Bootstrapped account:", bootstrap.address);
console.log("Checkpoint account matches:", same(checkpoint.account, bootstrap.address));
console.log("V3 account matches:", same(v3[3], bootstrap.address));
console.log("Checkpoint nonce:", String(checkpoint.nonce));
console.log("V3 nonce:", String(v3[11]));
console.log("V3 deadline (Unix):", String(v3[12]));
console.log("V3 input deadline:", String(input.deadline));
console.log("Deadline bindings match:", same(v3[12], input.deadline));
console.log("Current local Unix time:", Math.floor(Date.now()/1000));
console.log("Deadline expired by local clock:", BigInt(v3[12]) < BigInt(Math.floor(Date.now()/1000)));
console.log("Delegatee:", checkpoint.delegatee);
console.log("Self-delegated:", same(checkpoint.delegatee, bootstrap.address));
console.log("NOTE: Non-self delegatee permission requires an on-chain read.");
console.log("RPC requests: NO; transactions: NO; files modified: NO");
if (!matches.size) process.exitCode = 2;
