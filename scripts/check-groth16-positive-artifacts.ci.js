#!/usr/bin/env node
"use strict";
// Strict CI readiness gate. Never print proving-key contents.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = process.cwd();
const groups = {
  v3: [
    "build/v3-timestamp-fixed/EchoAuthorizationVerifierV3_js/EchoAuthorizationVerifierV3.wasm",
    "build/v3-timestamp-fixed/verification_key.json",
    "build/v3-timestamp-fixed/proof.json",
    "build/v3-timestamp-fixed/public.json",
    "build/v3-timestamp-fixed/circuit_final.zkey"
  ],
  v4: [
    "build/v4-geographic/verification_key.json",
    "build/v4-geographic/proof.json",
    "build/v4-geographic/public.json",
    "build/v4-geographic/circuit_final.zkey"
  ]
};
let missing = 0;
for (const [group, files] of Object.entries(groups)) {
  console.log("CHECK", group);
  for (const file of files) {
    const full = path.resolve(root, file);
    if (!full.startsWith(root + path.sep)) throw new Error("unsafe path");
    if (!fs.existsSync(full) || !fs.statSync(full).isFile() || fs.statSync(full).size === 0) {
      console.log("MISSING_OR_EMPTY", file);
      missing++;
      continue;
    }
    const hash = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    console.log("PRESENT", file, "bytes="+fs.statSync(full).size, "sha256="+hash);
    if (file.endsWith(".json")) {
      try { JSON.parse(fs.readFileSync(full, "utf8")); }
      catch { console.log("INVALID_JSON", file); missing++; }
    }
  }
}
if (missing) {
  console.error("FAIL: "+missing+" required artifact(s) absent, empty, or invalid. Positive Groth16 CI cannot be claimed reproducible.");
  process.exitCode = 1;
} else {
  console.log("ARTIFACT FILE READINESS PASSED. Cryptographic proof verification and trusted-setup provenance remain UNVERIFIED.");
}
