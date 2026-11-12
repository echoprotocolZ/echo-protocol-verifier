#!/usr/bin/env node
"use strict";
// Offline cryptographic verification of existing Groth16 proofs. No RPC, no writes.
const fs = require("node:fs");
const snarkjs = require("snarkjs");
const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
async function main() {
  const dir = "build/v4-geographic-bound/proofs/";
  const cases = [
    { name: "V3", proof: "v3-amoy-matching-proof.json", public: "v3-amoy-matching-public.json", zkey: "build/v3-timestamp-fixed/EchoAuthorizationVerifierV3_final.zkey", length: 20 },
    { name: "V4", proof: "approved-zone-proof.json", public: "approved-zone-public.json", zkey: "build/v4-geographic-bound/setup/EchoGeographicBoundV4_final.zkey", length: 5 }
  ];
  const results = [];
  for (const c of cases) {
    const signals = read(dir + c.public);
    if (!Array.isArray(signals) || signals.length !== c.length) throw Error(c.name + " public signal count mismatch");
    const proof = read(dir + c.proof);
    const vk = await snarkjs.zKey.exportVerificationKey(c.zkey);
    const valid = await snarkjs.groth16.verify(vk, signals, proof);
    console.log(c.name + " GROTH16 CRYPTOGRAPHIC VERIFICATION:", valid ? "PASS" : "FAIL");
    results.push({ signals, valid });
  }
  const [v3, v4] = results;
  const same = BigInt(v3.signals[18]) === BigInt(v4.signals[4]);
  console.log("V3/V4 SHARED CHECKPOINT:", same ? "PASS" : "FAIL");
  const signed = read(dir + "v4-signed-checkpoint.json");
  const record = read("deployments/amoy/echo-v4-bootstrapped-account.json");
  const bound = signed.checkpoint.account.toLowerCase() === record.address.toLowerCase()
    && BigInt(signed.checkpoint.nonce) === BigInt(v3.signals[11])
    && BigInt(signed.checkpoint.checkpointCommitment) === BigInt(v3.signals[18])
    && BigInt(signed.checkpoint.authorizationCommitment) === BigInt(v3.signals[1]);
  console.log("SIGNED CHECKPOINT FIELD BINDINGS:", bound ? "PASS" : "FAIL");
  console.log("SIGNATURE DIGEST AND RECOVERY: NOT VERIFIED OFFLINE");
  console.log("ON-CHAIN ACCEPTANCE AND ACCOUNT NONCE: NOT VERIFIED");
  console.log("NO RPC OR TRANSACTIONS");
  if (!v3.valid || !v4.valid || !same || !bound) process.exitCode = 2;
  else console.log("OFFLINE GROTH16 VERIFICATION PASS");
}
main().catch(e => { console.error("ERROR:", e.message); process.exitCode = 1; });
