// Rebuild disposable V3 test artifacts in CI; never use these as production proofs.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { buildPoseidon } = require("circomlibjs");
const path = require("node:path");

async function main() {
  const base = "build/v3-timestamp-fixed";
  const circuit = "EchoAuthorizationVerifierV3";
  fs.mkdirSync(base, { recursive: true });
  execFileSync("npx", ["--no-install", "circom2", circuit + ".circom",
    "--r1cs", "--sym", "--wasm", "-l", "node_modules", "-o", base], { stdio: "inherit" });
  const poseidon = await buildPoseidon();
  const hash = (...values) => poseidon.F.toString(poseidon(values.map(v => BigInt(v))));
  const input = {
    account:"1001", delegatee:"4004", validator:"2002", target:"3003",
    value:"100", calldataHashLow:"12345", calldataHashHigh:"67890",
    chainId:"137", nonce:"1", deadline:"2000000000",
    targetX:"100000", targetY:"200000", maxDistanceSq:"10000",
    minTimestamp:"1700000000", maxTimestamp:"1900000000",
    fragmentPayload:"42", fragmentSalt:"123456",
    checkpointX:"100050", checkpointY:"200000", checkpointTimestamp:"1800000000"
  };
  input.expectedFragmentCommitment = hash(input.fragmentPayload, input.fragmentSalt);
  input.expectedCheckpointCommitment = hash(input.checkpointX, input.checkpointY, input.checkpointTimestamp);
  input.expectedCheckpointTimestamp = input.checkpointTimestamp;
  const first = hash(input.account, input.delegatee, input.validator,
    input.target, input.value, input.calldataHashLow, input.calldataHashHigh,
    input.chainId, input.nonce, input.deadline, input.expectedFragmentCommitment,
    input.targetX, input.targetY, input.maxDistanceSq, input.minTimestamp, input.maxTimestamp);
  input.expectedAuthorizationCommitment = hash(first, input.expectedCheckpointCommitment);
  input.expectedNullifier = hash(input.account, input.expectedAuthorizationCommitment);
  const inputPath = path.join(base, "input-local.json");
  fs.writeFileSync(inputPath, JSON.stringify(input, null, 2));
  // Legacy V3 integration tests read the same base fixture from v3-bound.
  // Copy only input data; this is not a proof or proving key.
  const legacyDir = "build/v3-bound";
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(path.join(legacyDir, "input-local.json"), JSON.stringify(input, null, 2));
  const jsDir = path.join(base, circuit + "_js");
  const witness = path.join(base, "witness.wtns");
  execFileSync(process.execPath, [path.join(jsDir, "generate_witness.js"),
    path.join(jsDir, circuit + ".wasm"), inputPath, witness], { stdio: "inherit" });
  execFileSync("npx", ["--no-install", "snarkjs", "wtns", "check",
    path.join(base, circuit + ".r1cs"), witness], { stdio: "inherit" });
  const witnessJson = path.join(base, "witness.json");
  execFileSync("npx", ["--no-install", "snarkjs", "wtns", "export", "json",
    witness, witnessJson], { stdio: "inherit" });
  const values = JSON.parse(fs.readFileSync(witnessJson, "utf8"));
  if (values.length < 21) throw new Error("Expected 20 public signals in witness");
  fs.writeFileSync(path.join(base, "public.json"), JSON.stringify(values.slice(1, 21), null, 2));
  console.log("Generated local V3 CI artifacts (NOT production proofs)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
