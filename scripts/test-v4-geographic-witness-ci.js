"use strict";
// Disposable V4 geographic witness checks: no trusted setup or proving keys.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { buildPoseidon } = require("circomlibjs");

async function main() {
  const base = "build/v4-geographic-bound";
  const circuit = "EchoGeographicBoundV4";
  const wasm = path.join(base, circuit + "_js", circuit + ".wasm");
  const generator = path.join(base, circuit + "_js", "generate_witness.js");
  const r1cs = path.join(base, circuit + ".r1cs");
  for (const p of [wasm, generator, r1cs]) {
    assert(fs.existsSync(p), "Missing compiled circuit output: " + p);
  }
  const poseidon = await buildPoseidon();
  const hash = (a, b, c) => poseidon.F.toString(poseidon([BigInt(a), BigInt(b), BigInt(c)]));
  const valid = {
    checkpointLat: "100050", checkpointLon: "200000",
    checkpointTimestamp: "1800000000",
    minLat: "100000", maxLat: "101000",
    minLon: "199000", maxLon: "201000",
  };
  valid.expectedCheckpointCommitment = hash(
    valid.checkpointLat, valid.checkpointLon, valid.checkpointTimestamp
  );
  const cases = [
    ["valid-boundary", valid, true],
    ["valid-exact-lower-bound", {...valid, checkpointLat: valid.minLat, checkpointLon: valid.minLon, expectedCheckpointCommitment: hash(valid.minLat, valid.minLon, valid.checkpointTimestamp)}, true],
    ["valid-exact-upper-bound", {...valid, checkpointLat: valid.maxLat, checkpointLon: valid.maxLon, expectedCheckpointCommitment: hash(valid.maxLat, valid.maxLon, valid.checkpointTimestamp)}, true],
    ["outside-latitude", {...valid, checkpointLat: "101001"}, false],
    ["outside-longitude", {...valid, checkpointLon: "201001"}, false],
    ["wrong-commitment", {...valid, expectedCheckpointCommitment: "0"}, false],
    ["tampered-timestamp", {...valid, checkpointTimestamp: "1800000001"}, false],
    ["tampered-checkpoint-latitude", {...valid, checkpointLat: "100051"}, false],
    ["negative-latitude", {...valid, checkpointLat: "-1"}, false],
    ["longitude-over-domain", {...valid, checkpointLon: "3600000001"}, false],
    ["invalid-latitude-domain", {...valid, checkpointLat: "1800000001"}, false],
    ["reversed-zone", {...valid, minLat: "101000", maxLat: "100000"}, false],
  ];
  const dir = path.join(base, "ci-witness-checks");
  fs.mkdirSync(dir, {recursive: true});
  for (const [name, input, shouldPass] of cases) {
    const inputFile = path.join(dir, name + ".json");
    const witnessFile = path.join(dir, name + ".wtns");
    fs.writeFileSync(inputFile, JSON.stringify(input));
    let passed = false;
    try {
      execFileSync(process.execPath, [generator, wasm, inputFile, witnessFile],
        {stdio: "pipe"});
      execFileSync("npx", ["--no-install", "snarkjs", "wtns", "check", r1cs, witnessFile],
        {stdio: "pipe"});
      passed = true;
    } catch (error) {
      if (shouldPass) {
        process.stderr.write(String(error.stderr || error.message) + "\n");
      }
    }
    assert.equal(passed, shouldPass, name + ": unexpected witness result");
    console.log("PASS " + name + " (" + (shouldPass ? "accepted" : "rejected") + ")");
  }
  console.log("V4 geographic witness checks passed (NOT a Groth16 proof)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
