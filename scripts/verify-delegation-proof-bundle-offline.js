#!/usr/bin/env node
"use strict";
// Strict offline validator for NEW delegation proof bundle. No RPC or transactions.
// Input JSON shape: {account,delegatee,authorized,chainId,nonce,checkpoint,
//   signature,v3PublicSignals,v4PublicSignals,v3Proof,v4Proof,
//   v3VerificationKey,v4VerificationKey}
// Verification keys must be actual JSON objects (not paths).
const fs = require("node:fs");
const { ethers } = require("ethers");
const snarkjs = require("snarkjs");
const fail = msg => { throw Error(msg); };
const eq = (a,b,label) => { if (BigInt(a) !== BigInt(b)) fail(label + " mismatch"); };
async function main() {
  const filename = process.argv[2];
  if (!filename) fail("Usage: node scripts/verify-delegation-proof-bundle-offline.js <bundle.json>");
  const b = JSON.parse(fs.readFileSync(filename,"utf8"));
  const account = ethers.getAddress(b.account);
  const delegatee = ethers.getAddress(b.delegatee);
  if (account === ethers.ZeroAddress || delegatee === ethers.ZeroAddress || account === delegatee) fail("invalid addresses");
  if (typeof b.authorized !== "boolean") fail("authorized must be boolean");
  const nonce = BigInt(b.nonce), chainId = BigInt(b.chainId);
  if (nonce < 0n || chainId <= 0n) fail("invalid nonce/chain");
  const c = b.checkpoint;
  if (!c || !b.signature || !ethers.isHexString(b.signature,65)) fail("missing checkpoint or 65-byte signature");
  if (ethers.getAddress(c.account) !== account || ethers.getAddress(c.delegatee) !== account) fail("checkpoint must be self-delegated");
  eq(c.nonce,nonce,"checkpoint nonce");
  const v3 = b.v3PublicSignals, v4 = b.v4PublicSignals;
  if (!Array.isArray(v3) || v3.length !== 20 || !Array.isArray(v4) || v4.length !== 5) fail("invalid public signal lengths");
  const intent = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32","uint256","address","address","bool","uint256"],
    [ethers.id("ECHO_PROTOCOL_Z_V4_DELEGATEE_ADMIN_V1"),chainId,account,delegatee,b.authorized,nonce]
  );
  const hash = BigInt(ethers.keccak256(intent)), mask = (1n<<128n)-1n;
  for (const [index,value,label] of [
    [1,c.authorizationCommitment,"authorization commitment"],
    [3,BigInt(account),"account"],[4,BigInt(account),"checkpoint delegatee"],
    [6,BigInt(account),"target"],[7,0n,"value"],[8,hash&mask,"calldata low"],
    [9,hash>>128n,"calldata high"],[10,chainId,"chain"],[11,nonce,"nonce"],
    [18,c.checkpointCommitment,"checkpoint commitment"],[19,c.timestamp,"timestamp"]
  ]) eq(v3[index],value,label);
  eq(v3[18],v4[4],"V3/V4 shared checkpoint");
  if (BigInt(c.timestamp)<BigInt(v3[16]) || BigInt(c.timestamp)>BigInt(v3[17])) fail("checkpoint outside proof time window");
  if (BigInt(v3[2])===0n) fail("zero nullifier");
  if (!b.v3Proof || !b.v4Proof || !b.v3VerificationKey || !b.v4VerificationKey) fail("missing proof or verification key");
  if (!await snarkjs.groth16.verify(b.v3VerificationKey,v3,b.v3Proof)) fail("V3 Groth16 invalid");
  if (!await snarkjs.groth16.verify(b.v4VerificationKey,v4,b.v4Proof)) fail("V4 Groth16 invalid");
  console.log("DELEGATION INTENT BINDINGS: PASS");
  console.log("SELF-DELEGATED CHECKPOINT BINDINGS: PASS");
  console.log("V3/V4 GROTH16 CRYPTOGRAPHIC VERIFICATION: PASS");
  console.log("SIGNATURE RECOVERY/TRUST: NOT VERIFIED (requires registry digest and policy)");
  console.log("ON-CHAIN AUTHORIZATION/REPLAY: NOT VERIFIED");
  console.log("NO TRANSACTIONS BROADCAST");
}
main().catch(e=>{ console.error("FAIL:",e.message);process.exitCode=1;});
