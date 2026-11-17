#!/usr/bin/env node
"use strict";
// Produces deterministic public transaction bindings for a NEW delegation proof.
// This does not generate Groth16 witnesses, signatures, checkpoints or proofs.
const { ethers } = require("ethers");

function main() {
  const [accountArg, delegateeArg, decisionArg, nonceArg, chainArg] = process.argv.slice(2);
  if (!accountArg || !delegateeArg || !["true", "false"].includes(decisionArg) ||
      nonceArg === undefined || chainArg === undefined) {
    throw Error("Usage: node scripts/prepare-delegation-proof-inputs.js <candidate-account> <delegatee> <true|false> <nonce> <chainId>");
  }
  const account = ethers.getAddress(accountArg);
  const delegatee = ethers.getAddress(delegateeArg);
  if (account === ethers.ZeroAddress || delegatee === ethers.ZeroAddress || account === delegatee) {
    throw Error("Invalid account/delegatee addresses");
  }
  const nonce = BigInt(nonceArg);
  const chainId = BigInt(chainArg);
  if (nonce < 0n || chainId <= 0n) throw Error("Invalid nonce/chain ID");
  const authorized = decisionArg === "true";
  const domain = ethers.id("ECHO_PROTOCOL_Z_V4_DELEGATEE_ADMIN_V1");
  const intent = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "uint256", "address", "address", "bool", "uint256"],
    [domain, chainId, account, delegatee, authorized, nonce]
  );
  const hash = BigInt(ethers.keccak256(intent));
  const mask = (1n << 128n) - 1n;
  const output = {
    warning: "TRANSACTION BINDINGS ONLY. Not a witness, Groth16 proof, validator signature or on-chain authorization.",
    chainId: chainId.toString(), account, checkpointDelegatee: account,
    permissionDelegatee: delegatee, authorized, nonce: nonce.toString(),
    target: account, value: "0", intent, intentHash: ethers.toBeHex(hash, 32),
    expectedV3Signals: {
      "3_account": BigInt(account).toString(),
      "4_checkpointDelegatee": BigInt(account).toString(),
      "6_target": BigInt(account).toString(),
      "7_value": "0",
      "8_callDataHashLow128": (hash & mask).toString(),
      "9_callDataHashHigh128": (hash >> 128n).toString(),
      "10_chainId": chainId.toString(),
      "11_nonce": nonce.toString()
    },
    stillRequired: [
      "fresh self-delegated signed checkpoint bound to candidate and nonce",
      "valid trusted validator signature and time window",
      "fresh V3 witness and Groth16 proof matching ALL 20 signals",
      "fresh V4 geographic witness and Groth16 proof matching ALL 5 signals",
      "matching V3/V4 checkpoint commitment and unused nullifier",
      "local bridge authorization and post-success replay tests"
    ]
  };
  console.log(JSON.stringify(output, null, 2));
}
try { main(); } catch (e) { console.error("ERROR:", e.message); process.exitCode = 1; }
