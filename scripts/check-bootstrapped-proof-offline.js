// Offline proof-material binding checks. No Hardhat or RPC required.
// Does NOT validate on-chain state or Groth16 cryptographic validity.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
try {
  const record = read("deployments/amoy/echo-v4-bootstrapped-account.json");
  if (Number(record.chainId) !== 80002) throw Error("Deployment record is not Amoy");
  const dir = "build/v4-geographic-bound/proofs";
  const required = ["v4-signed-checkpoint.json", "v3-amoy-matching-proof.json", "v3-amoy-matching-public.json", "approved-zone-proof.json", "approved-zone-public.json"];
  for (const name of required) {
    const filename = path.join(dir, name);
    console.log("PROOF FILE:", name, fs.existsSync(filename) ? "present" : "MISSING");
    if (!fs.existsSync(filename)) throw Error("Missing " + filename);
  }
  const checkpoint = read(path.join(dir, required[0])).checkpoint;
  const v3 = read(path.join(dir, required[2]));
  const v4 = read(path.join(dir, required[4]));
  const checks = [
    ["checkpoint account", checkpoint.account?.toLowerCase() === record.address?.toLowerCase()],
    ["checkpoint/V3 nonce", BigInt(checkpoint.nonce) === BigInt(v3[11])],
    ["V3/V4 commitment", BigInt(v3[18]) === BigInt(v4[4])],
    ["checkpoint commitment", BigInt(checkpoint.checkpointCommitment) === BigInt(v3[18])],
    ["authorization commitment", BigInt(checkpoint.authorizationCommitment) === BigInt(v3[1])]
  ];
  let ready = true;
  for (const [label, ok] of checks) {
    console.log("BINDING:", label, ok ? "PASS" : "REGENERATE");
    if (!ok) ready = false;
  }
  console.log(ready ? "OFFLINE BINDINGS PASS" : "OFFLINE BINDINGS NOT READY");
  console.log("ON-CHAIN NONCE, CODE, SIGNATURE AND GROTH16 VERIFICATION: NOT CHECKED");
  console.log("NO TRANSACTIONS BROADCAST");
  if (!ready) process.exitCode = 2;
} catch (error) {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
}
