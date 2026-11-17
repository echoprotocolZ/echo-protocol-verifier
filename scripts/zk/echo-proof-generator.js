"use strict";

const fs = require("node:fs");
const path = require("node:path");
const snarkjs = require("snarkjs");

const ROOT = path.resolve(__dirname, "../..");

const CIRCUITS = Object.freeze({
  v3: {
    wasm: "build/v3-timestamp-fixed/EchoAuthorizationVerifierV3_js/EchoAuthorizationVerifierV3.wasm",
    zkey: "build/v3-timestamp-fixed/EchoAuthorizationVerifierV3_final.zkey",
    vkey: "build/v3-timestamp-fixed/verification_key.json",
    publicInputs: 20
  },
  v4: {
    wasm: "build/v4-geographic-bound/EchoGeographicBoundV4_js/EchoGeographicBoundV4.wasm",
    zkey: "build/v4-geographic-bound/setup/EchoGeographicBoundV4_final.zkey",
    vkey: "build/v4-geographic-bound/verification_key.json",
    publicInputs: 5
  }
});

function resolveArtifacts(version) {
  const config = CIRCUITS[version];

  if (!config) {
    throw new Error(`Unsupported circuit version: ${version}`);
  }

  const result = {};

  for (const field of ["wasm", "zkey", "vkey"]) {
    const filename = path.join(ROOT, config[field]);

    if (!fs.existsSync(filename) || fs.statSync(filename).size === 0) {
      throw new Error(`Missing ${version} artifact: ${filename}`);
    }

    result[field] = filename;
  }

  result.publicInputs = config.publicInputs;
  return result;
}

function normalizeBigInts(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeBigInts);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeBigInts(item)
      ])
    );
  }

  return value;
}

async function generateProof(version, input) {
  const artifacts = resolveArtifacts(version);

  const verificationKey = JSON.parse(
    fs.readFileSync(artifacts.vkey, "utf8")
  );

  if (
    Number(verificationKey.nPublic) !== artifacts.publicInputs ||
    verificationKey.IC.length !== artifacts.publicInputs + 1
  ) {
    throw new Error(`${version}: invalid verification key dimensions`);
  }

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    normalizeBigInts(input),
    artifacts.wasm,
    artifacts.zkey
  );

  if (publicSignals.length !== artifacts.publicInputs) {
    throw new Error(`${version}: unexpected public signal count`);
  }

  const verified = await snarkjs.groth16.verify(
    verificationKey,
    publicSignals,
    proof
  );

  if (!verified) {
    throw new Error(`${version}: Groth16 proof verification failed`);
  }

  const solidityCallData =
    await snarkjs.groth16.exportSolidityCallData(
      proof,
      publicSignals
    );

  const [a, b, c, signals] =
    JSON.parse(`[${solidityCallData}]`);

  return {
    proof,
    publicSignals,
    solidity: { a, b, c, signals }
  };
}

module.exports = {
  CIRCUITS,
  resolveArtifacts,
  normalizeBigInts,
  generateProof
};
