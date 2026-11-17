#!/usr/bin/env node
"use strict";
// Generate candidate-specific REAL Groth16 proofs from user-provided witnesses.
// Offline only. Never modifies existing Amoy proof artifacts or broadcasts tx.
// Usage: node scripts/generate-delegation-proof-bundle-offline.js <manifest.json> <output.json>
// Manifest: {account,delegatee,authorized,chainId,nonce,checkpoint,signature,
//   v3InputFile,v4InputFile,v3WasmFile,v4WasmFile,v3ZkeyFile,v4ZkeyFile}
const fs = require("node:fs");
const path = require("node:path");
const snarkjs = require("snarkjs");
const { ethers } = require("ethers");
function read(file) { return JSON.parse(fs.readFileSync(file,"utf8")); }
function need(file) { if (!fs.existsSync(file)) throw Error("Missing file: "+file); }
async function main() {
  const [manifestFile,outputFile] = process.argv.slice(2);
  if (!manifestFile || !outputFile) throw Error("Usage: node scripts/generate-delegation-proof-bundle-offline.js <manifest.json> <output.json>");
  need(manifestFile);
  const m = read(manifestFile);
  for (const key of ["v3InputFile","v4InputFile","v3WasmFile","v4WasmFile","v3ZkeyFile","v4ZkeyFile"]) {
    if (typeof m[key] !== "string") throw Error("Manifest missing "+key);
    need(m[key]);
  }
  if (!m.checkpoint || !m.signature) throw Error("Manifest missing signed checkpoint");
  if (path.resolve(outputFile) === path.resolve(manifestFile)) throw Error("Output cannot overwrite manifest");
  const existing = ["v3-amoy-matching-proof.json","approved-zone-proof.json","v4-signed-checkpoint.json"];
  if (existing.includes(path.basename(outputFile))) throw Error("Refusing to overwrite existing Amoy proof artifacts");
  const v3 = await snarkjs.groth16.fullProve(read(m.v3InputFile),m.v3WasmFile,m.v3ZkeyFile);
  const v4 = await snarkjs.groth16.fullProve(read(m.v4InputFile),m.v4WasmFile,m.v4ZkeyFile);
  const v3VerificationKey = await snarkjs.zKey.exportVerificationKey(m.v3ZkeyFile);
  const v4VerificationKey = await snarkjs.zKey.exportVerificationKey(m.v4ZkeyFile);
  if (!await snarkjs.groth16.verify(v3VerificationKey,v3.publicSignals,v3.proof)) throw Error("V3 Groth16 verification failed");
  if (!await snarkjs.groth16.verify(v4VerificationKey,v4.publicSignals,v4.proof)) throw Error("V4 Groth16 verification failed");
  if (v3.publicSignals.length !== 20 || v4.publicSignals.length !== 5) throw Error("Unexpected public signal lengths");
  if (BigInt(v3.publicSignals[18]) !== BigInt(v4.publicSignals[4])) throw Error("V3/V4 checkpoint commitment mismatch");
  const bundle = {
    account:ethers.getAddress(m.account),delegatee:ethers.getAddress(m.delegatee),
    authorized:m.authorized,chainId:String(m.chainId),nonce:String(m.nonce),
    checkpoint:m.checkpoint,signature:m.signature,
    v3PublicSignals:v3.publicSignals,v4PublicSignals:v4.publicSignals,
    v3Proof:v3.proof,v4Proof:v4.proof,v3VerificationKey,v4VerificationKey
  };
  // Validate all transaction bindings using the same offline verifier before saving.
  const account = bundle.account, delegatee = bundle.delegatee;
  if (typeof bundle.authorized !== "boolean" || account === delegatee) throw Error("Invalid delegation");
  if (ethers.getAddress(bundle.checkpoint.account)!==account || ethers.getAddress(bundle.checkpoint.delegatee)!==account) throw Error("Checkpoint must be self-delegated");
  const intent = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32","uint256","address","address","bool","uint256"],
    [ethers.id("ECHO_PROTOCOL_Z_V4_DELEGATEE_ADMIN_V1"),BigInt(bundle.chainId),account,delegatee,bundle.authorized,BigInt(bundle.nonce)]
  );
  const hash = BigInt(ethers.keccak256(intent));
  const expected = [[3,BigInt(account)],[4,BigInt(account)],[6,BigInt(account)],[7,0n],
    [8,hash & ((1n<<128n)-1n)],[9,hash>>128n],[10,BigInt(bundle.chainId)],
    [11,BigInt(bundle.nonce)],[1,BigInt(bundle.checkpoint.authorizationCommitment)],
    [18,BigInt(bundle.checkpoint.checkpointCommitment)],[19,BigInt(bundle.checkpoint.timestamp)]];
  for (const [i,v] of expected) if (BigInt(v3.publicSignals[i])!==v) throw Error("V3 signal "+i+" mismatch; refusing to save");
  if (BigInt(bundle.checkpoint.nonce)!==BigInt(bundle.nonce)) throw Error("Checkpoint nonce mismatch");
  if (BigInt(v3.publicSignals[2])===0n) throw Error("Zero nullifier");
  if (BigInt(bundle.checkpoint.timestamp)<BigInt(v3.publicSignals[16]) ||
      BigInt(bundle.checkpoint.timestamp)>BigInt(v3.publicSignals[17])) throw Error("Checkpoint time window mismatch");
  if (!ethers.isHexString(bundle.signature,65)) throw Error("Expected 65-byte checkpoint signature");
  fs.mkdirSync(path.dirname(outputFile),{recursive:true});
  fs.writeFileSync(outputFile,JSON.stringify(bundle,null,2)+"\n",{flag:"wx",mode:0o600});
  console.log("NEW V3/V4 GROTH16 PROOFS: VERIFIED");
  console.log("CANDIDATE TRANSACTION BINDINGS: VERIFIED");
  console.log("BUNDLE SAVED:",outputFile);
  console.log("SIGNATURE TRUST AND ON-CHAIN EXECUTION: NOT VERIFIED");
  console.log("NO RPC OR TRANSACTIONS");
}
main().catch(e=>{console.error("FAIL:",e.message);process.exitCode=1;});
