#!/usr/bin/env node
"use strict";
// Decode a custom error selector against every locally compiled contract ABI.
// No RPC, no signer, no transactions.
const fs = require("node:fs");
const path = require("node:path");
const { id, Interface } = require("ethers");
// Fixed selector from the observed Amoy revert; no terminal argument parsing.
const selector = "0x157a3759";
const root = "artifacts/contracts";
let found = 0;
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (p.endsWith(".json") && !p.endsWith(".dbg.json")) {
      let artifact;
      try { artifact = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
      if (!Array.isArray(artifact.abi)) continue;
      for (const item of artifact.abi) {
        if (item.type !== "error") continue;
        const signature = new Interface([item]).getError(item.name).format("sighash");
        if (id(signature).slice(0, 10).toLowerCase() === selector) {
          console.log("MATCH:", signature, "CONTRACT:", artifact.contractName || p);
          found++;
        }
      }
    }
  }
}
walk(root);
console.log("SELECTOR:", selector);
console.log("MATCHING ARTIFACT ERRORS:", found);
if (!found) {
  console.log("No matching compiled custom error. Run npx hardhat compile and retry.");
  process.exitCode = 2;
}
