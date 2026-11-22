#!/usr/bin/env node
// Local-only, fail-closed prerequisite gate. Never reads or prints secret key bytes.
const fs = require("node:fs");
const path = require("node:path");
const required = [
  ["V3 proof", "build/v3-timestamp-fixed/proof.json"],
  ["V3 public signals", "build/v3-timestamp-fixed/public.json"],
  ["V3 verification key", "build/v3-timestamp-fixed/verification_key.json"],
  ["V4 proof", "build/v4-geographic-bound/proof.json"],
  ["V4 public signals", "build/v4-geographic-bound/public.json"],
  ["V4 verification key", "build/v4-geographic-bound/verification_key.json"]
];
let missing = 0;
for (const [label, file] of required) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile() || fs.statSync(full).size === 0) {
    console.error("NOT READY:", label, "missing or empty:", file);
    missing++;
    continue;
  }
  try {
    const data = JSON.parse(fs.readFileSync(full, "utf8"));
    if (!data || typeof data !== "object") throw Error("invalid JSON object");
    console.log("PRESENT:", label, file);
  } catch {
    console.error("NOT READY:", label, "invalid JSON:", file);
    missing++;
  }
}
if (missing) {
  console.error("POSITIVE GROTH16 PREREQUISITES: BLOCKED (" + missing + " missing/invalid).");
  process.exitCode = 1;
} else {
  console.log("POSITIVE GROTH16 PREREQUISITES: FILES PRESENT; verification and key provenance NOT established.");
}
