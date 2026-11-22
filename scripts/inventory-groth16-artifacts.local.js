#!/usr/bin/env node
// Read-only local inventory. Never prints or uploads proving-key contents.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = process.cwd();
const candidates = [
  "build/v3-timestamp-fixed/EchoAuthorizationVerifierV3.r1cs",
  "build/v3-timestamp-fixed/EchoAuthorizationVerifierV3_js/EchoAuthorizationVerifierV3.wasm",
  "build/v3-timestamp-fixed/verification_key.json",
  "build/v3-timestamp-fixed/proof.json",
  "build/v3-timestamp-fixed/public.json",
  "build/v3-timestamp-fixed/circuit_final.zkey",
  "build/v4-geographic/verification_key.json",
  "build/v4-geographic/proof.json",
  "build/v4-geographic/public.json",
  "build/v4-geographic/circuit_final.zkey"
];
let positiveReady = true;
for (const name of candidates) {
  const full = path.join(root, name);
  if (!fs.existsSync(full)) {
    console.log("MISSING", name);
    if (/proof\.json$|public\.json$|verification_key\.json$|\.zkey$/.test(name)) positiveReady = false;
    continue;
  }
  const data = fs.readFileSync(full);
  const sha = crypto.createHash("sha256").update(data).digest("hex");
  console.log("PRESENT", name, "bytes=" + data.length, "sha256=" + sha);
}
console.log(positiveReady ? "ARTIFACT INVENTORY: candidate files present; cryptographic validity NOT established" :
  "ARTIFACT INVENTORY: positive-proof prerequisites missing; no valid-proof claim");
