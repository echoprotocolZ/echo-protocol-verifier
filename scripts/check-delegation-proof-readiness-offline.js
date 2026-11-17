"use strict";
// Read-only local preflight for real-proof delegation. Does not create a proof,
// change permissions, broadcast transactions, or claim deployment readiness.
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");

async function main() {
  const dir = "build/v4-geographic-bound/proofs";
  const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  const signed = read("v4-signed-checkpoint.json");
  const v3Public = read("v3-amoy-matching-public.json");
  const v4Public = read("approved-zone-public.json");
  const [,, , v3] = JSON.parse(`[${await snarkjs.groth16.exportSolidityCallData(read("v3-amoy-matching-proof.json"), v3Public)}]`);
  const [,, , v4] = JSON.parse(`[${await snarkjs.groth16.exportSolidityCallData(read("approved-zone-proof.json"), v4Public)}]`);
  const checkpoint = signed.checkpoint;
  const currentTarget = ethers.getAddress(ethers.toBeHex(BigInt(v3[6]), 20));
  const currentAccount = ethers.getAddress(checkpoint.account);
  const currentDelegatee = ethers.getAddress(checkpoint.delegatee);
  const currentNonce = BigInt(v3[11]);
  const isSelf = currentAccount === currentDelegatee;
  console.log("=== PROOF-BOUND DELEGATION PREFLIGHT (OFFLINE) ===");
  console.log("CHECKPOINT ACCOUNT:", currentAccount);
  console.log("CHECKPOINT DELEGATEE:", currentDelegatee);
  console.log("PROVEN TARGET:", currentTarget);
  console.log("PROVEN NONCE:", currentNonce.toString());
  console.log("V3 SIGNALS:", v3.length);
  console.log("V4 SIGNALS:", v4.length);
  console.log("SELF-DELEGATED CHECKPOINT:", isSelf);
  console.log("CANDIDATE CONTRACT ADDRESS: NOT PROVIDED / NOT DEPLOYED");
  console.log("NEW PROOF REQUIREMENTS: candidate account address, self-delegated checkpoint, candidate nonce, target=candidate, value=0, calldata=delegationIntent(delegatee,authorized), fresh nullifier and valid validator signature");
  console.log("EXISTING PROOFS REUSABLE FOR CANDIDATE DELEGATION: NO");
  console.log("READ ONLY: no transactions broadcast");
  if (!isSelf) console.log("EXISTING CHECKPOINT: external-delegatee; cannot satisfy candidate self-delegation gate");
}
main().catch(err => { console.error("PREFLIGHT ERROR:", err.message); process.exitCode = 1; });
