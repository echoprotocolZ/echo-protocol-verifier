#!/usr/bin/env node
// Local-only adversarial proof test; does not mutate source artifacts.
const fs = require("node:fs");
const path = require("node:path");
const snarkjs = require("snarkjs");
const suites = [
  ["V3", "build/v3-timestamp-fixed", 20],
  ["V4", "build/v4-geographic-bound", 5]
];
(async () => {
  for (const [name, dir, expected] of suites) {
    const [vkFile, publicFile, proofFile] = ["verification_key.json", "public.json", "proof.json"].map(f => path.join(dir, f));
    for (const file of [vkFile, publicFile, proofFile]) {
      if (!fs.existsSync(file)) throw new Error(name + " prerequisite missing: " + file);
    }
    const vk = JSON.parse(fs.readFileSync(vkFile, "utf8"));
    const signals = JSON.parse(fs.readFileSync(publicFile, "utf8"));
    const proof = JSON.parse(fs.readFileSync(proofFile, "utf8"));
    if (!Array.isArray(signals) || signals.length !== expected) throw new Error(name + " signal count mismatch");
    if (!await snarkjs.groth16.verify(vk, signals, proof)) throw new Error(name + " positive control failed");
    const field = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
    const mutated = signals.slice();
    mutated[0] = ((BigInt(mutated[0]) + 1n) % field).toString();
    if (await snarkjs.groth16.verify(vk, mutated, proof)) {
      throw new Error(name + " accepted tampered public signal");
    }
    console.log("PASS:", name, "valid proof accepted and mutated public signal rejected");
  }
})().catch(e => { console.error("FAIL:", e.message); process.exitCode = 1; });
