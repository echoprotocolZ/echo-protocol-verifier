#!/usr/bin/env node
"use strict";
// Read-only end-to-end feasibility audit. No transactions, keys or proofs changed.
const fs=require("node:fs");
const {ethers}=require("ethers");
const input=JSON.parse(fs.readFileSync("build/v3-timestamp-fixed/input-local.json","utf8"));
const s=JSON.parse(fs.readFileSync("build/v3-timestamp-fixed/public.json","utf8")).map(BigInt);
if(s.length!==20)throw Error("Expected 20 V3 public signals");
const addr=n=>ethers.getAddress(ethers.toBeHex(n,20));
const fields=[
 ["account",3],["delegatee",4],["validator",5],["target",6],
 ["value",7],["chainId",10],["nonce",11],["deadline",12],
 ["checkpointTimestamp",19]
];
console.log("=== Existing V3 fixture authorization constraints ===");
for(const [name,i] of fields)console.log(name+":",["account","delegatee","validator","target"].includes(name)?addr(s[i]):s[i].toString());
const dataHash=(s[9]<<128n)|s[8];
console.log("required keccak256(callData):",ethers.toBeHex(dataHash,32));
console.log("checkpoint commitment:",ethers.toBeHex(s[18],32));
console.log("authorization commitment:",ethers.toBeHex(s[1],32));
console.log("nullifier:",ethers.toBeHex(s[2],32));
console.log("input checkpoint coordinates:",String(input.checkpointX),String(input.checkpointY));
console.log("\n=== Requirements for real bridge -> smart account execution ===");
console.log("1. V3 account signal MUST equal newly deployed smart-account address.");
console.log("2. V3 validator signal MUST equal signer of registry EIP-712 checkpoint.");
console.log("3. V3 target/value/calldata hash MUST match the actual transaction.");
console.log("4. V3 chainId/nonce/deadline MUST match the execution chain and account state.");
console.log("5. Both V3/V4 proofs MUST share the signed checkpoint commitment.");
console.log("6. Registry trusted signer, bridge permission, attestation policy and geographic policy MUST all be configured.");
console.log("7. Proof-bound smart-account policy administration remains disabled; no bypass should be introduced.");
console.log("\nFIXTURE WARNING: the saved V3 proof is fixed to its printed account/validator/transaction. For a freshly deployed account, regenerate the V3 witness/proof and then regenerate V4 from the same checkpoint.");
