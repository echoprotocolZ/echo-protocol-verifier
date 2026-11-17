"use strict";
// Read-only Amoy bridge delegatee status. No transactions.
const fs = require("node:fs");
const hre = require("hardhat");
async function main() {
  if (hre.network.name !== "amoy") throw Error("Run with --network amoy");
  const record = JSON.parse(fs.readFileSync("deployments/amoy/echo-v4-bootstrapped-account.json", "utf8"));
  const signed = JSON.parse(fs.readFileSync("build/v4-geographic-bound/proofs/v4-signed-checkpoint.json", "utf8"));
  const checkpoint = signed.checkpoint;
  if (checkpoint.account.toLowerCase() !== record.address.toLowerCase()) throw Error("Checkpoint/account mismatch");
  const bridge = new hre.ethers.Contract(record.authorizationBridge,
    ["function authorizedDelegatees(address account,address delegatee) view returns (bool)"],
    hre.ethers.provider);
  const allowed = await bridge.authorizedDelegatees(record.address, checkpoint.delegatee);
  console.log("ACCOUNT:", record.address);
  console.log("DELEGATEE:", checkpoint.delegatee);
  console.log("BRIDGE:", record.authorizationBridge);
  console.log("SELF-DELEGATED:", checkpoint.delegatee.toLowerCase() === record.address.toLowerCase());
  console.log("EXPLICITLY AUTHORIZED:", allowed);
  console.log("BRIDGE DELEGATEE GATE:", allowed || checkpoint.delegatee.toLowerCase() === record.address.toLowerCase() ? "PASS" : "BLOCKED");
  console.log("READ ONLY: no transaction broadcast");
}
main().catch(e => { console.error("ERROR:", e.shortMessage || e.message); process.exitCode = 1; });
