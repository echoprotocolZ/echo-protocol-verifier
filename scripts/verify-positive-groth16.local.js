#!/usr/bin/env node
// Local-only positive Groth16 verification. No proving keys or secrets are printed.
const fs = require("node:fs");
const path = require("node:path");
const snarkjs = require("snarkjs");
const specs = [
  ["V3", "build/v3-timestamp-fixed", 20],
  ["V4", "build/v4-geographic", 5]
];
(async () => {
  let failures = 0;
  for (const [name, dir, count] of specs) {
    const paths = ["verification_key.json", "public.json", "proof.json"].map(n => path.join(dir, n));
    if (!paths.every(p => fs.existsSync(p) && fs.statSync(p).size > 0)) {
      console.error("BLOCKED:", name, "missing verification key, public signals or proof");
      failures++;
      continue;
    }
    try {
      const [vk, signals, proof] = paths.map(p => JSON.parse(fs.readFileSync(p, "utf8")));
      if (!Array.isArray(signals) || signals.length !== count) {
        throw new Error("public signal count mismatch: expected " + count);
      }
      if (!vk || vk.protocol !== "groth16" || !proof || proof.protocol !== "groth16") {
        throw new Error("not Groth16 artifacts");
      }
      const ok = await snarkjs.groth16.verify(vk, signals, proof);
      if (!ok) throw new Error("Groth16 verification returned false");
      console.log("PASS:", name, "Groth16 positive proof verified against supplied key");
    } catch (error) {
      console.error("FAIL:", name, error.message);
      failures++;
    }
  }
  if (failures) process.exitCode = 1;
  else console.log("NOTE: key provenance and Solidity verifier equivalence require separate checks.");
})().catch(e => { console.error("FAIL:", e.message); process.exitCode = 1; });
