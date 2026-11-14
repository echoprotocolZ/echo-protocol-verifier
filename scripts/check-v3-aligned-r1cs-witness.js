// Validate that the aligned circuit's witness satisfies its compiled R1CS.
// This is not a Groth16 proof or trusted-setup verification.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { buildPoseidon } = require("circomlibjs");

(async () => {
  const poseidon = await buildPoseidon();
  const H = (...xs) => poseidon.F.toString(poseidon(xs.map(BigInt)));
  const input = {
    account: "100", delegatee: "101", validator: "102", target: "103",
    value: "104", calldataHashLow: "105", calldataHashHigh: "106",
    chainId: "31337", nonce: "7", deadline: "1700000200",
    fragmentPayload: "41", fragmentSalt: "42",
    checkpointX: "100", checkpointY: "200", checkpointTimestamp: "1700000000",
    targetX: "102", targetY: "203", maxDistanceSq: "13",
    minTimestamp: "1699999999", maxTimestamp: "1700000001",
  };
  input.expectedFragmentCommitment = H(input.fragmentPayload, input.fragmentSalt);
  input.expectedCheckpointCommitment = H(input.checkpointX, input.checkpointY, input.checkpointTimestamp);
  const a = H(input.account, input.delegatee, input.validator, input.target, input.value,
    input.calldataHashLow, input.calldataHashHigh, input.chainId, input.nonce,
    input.deadline, input.expectedFragmentCommitment, input.targetX, input.targetY,
    input.maxDistanceSq, input.minTimestamp, input.maxTimestamp);
  input.expectedAuthorizationCommitment = H(a, input.expectedCheckpointCommitment);
  input.expectedNullifier = H(input.account, input.expectedAuthorizationCommitment);
  input.expectedCheckpointTimestamp = input.checkpointTimestamp;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-v3-r1cs-"));
  const base = "build/v3-aligned/EchoAuthorizationVerifierV3Aligned";
  try {
    const inputFile = path.join(dir, "input.json");
    const witnessFile = path.join(dir, "witness.wtns");
    fs.writeFileSync(inputFile, JSON.stringify(input));
    execFileSync(process.execPath, [
      base + "_js/generate_witness.js", base + "_js/EchoAuthorizationVerifierV3Aligned.wasm",
      inputFile, witnessFile
    ], { stdio: "inherit" });
    execFileSync("npx", ["--no-install", "snarkjs", "wtns", "check",
      base + ".r1cs", witnessFile], { stdio: "inherit" });
    console.log("PASS: aligned V3 witness satisfies compiled R1CS");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
