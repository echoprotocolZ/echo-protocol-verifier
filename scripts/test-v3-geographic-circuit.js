const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { buildPoseidon } = require("circomlibjs");

const root = process.cwd();
const base = "build/v3-timestamp-fixed";
const circuit = "EchoAuthorizationVerifierV3";

const inputPath = path.join(root, base, "input-local.json");
const wasmPath = path.join(root, base, `${circuit}_js`, `${circuit}.wasm`);
const generatorPath = path.join(root, base, `${circuit}_js`, "generate_witness.js");
const r1csPath = path.join(root, base, `${circuit}.r1cs`);

const cases = [
  { name: "Valid distance", x: "100050", y: "200000", shouldPass: true },
  { name: "Exact distance boundary", x: "100100", y: "200000", shouldPass: true },
  { name: "Outside distance boundary", x: "100101", y: "200000", shouldPass: false },
  { name: "Invalid GPS latitude", x: "1800000001", y: "200000", shouldPass: true, targetX: "1800000001" },
  { name: "Invalid GPS longitude", x: "100000", y: "3600000001", shouldPass: true, targetX: "100000", targetY: "3600000001" }
];

(async () => {
  const poseidon = await buildPoseidon();
  const hash = (...values) =>
    poseidon.F.toString(poseidon(values.map(v => BigInt(v))));

  const original = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "echo-v3-geo-"));

  try {
    for (let i = 0; i < cases.length; i++) {
      const test = cases[i];
      const input = { ...original };

      input.checkpointX = test.x;
      input.checkpointY = test.y;
      if (test.targetX !== undefined) input.targetX = test.targetX;
      if (test.targetY !== undefined) input.targetY = test.targetY;

      input.expectedFragmentCommitment = hash(input.fragmentPayload, input.fragmentSalt);
      input.expectedCheckpointCommitment = hash(
        input.checkpointX, input.checkpointY, input.checkpointTimestamp
      );

      const auth1 = hash(
        input.account, input.delegatee, input.validator,
        input.target, input.value, input.calldataHashLow,
        input.calldataHashHigh, input.chainId, input.nonce,
        input.deadline, input.expectedFragmentCommitment,
        input.targetX, input.targetY, input.maxDistanceSq,
        input.minTimestamp, input.maxTimestamp
      );

      input.expectedAuthorizationCommitment = hash(
        auth1, input.expectedCheckpointCommitment
      );
      input.expectedNullifier = hash(
        input.account, input.expectedAuthorizationCommitment
      );

      const json = path.join(temp, `case-${i}.json`);
      const witness = path.join(temp, `case-${i}.wtns`);

      fs.writeFileSync(json, JSON.stringify(input));

      let passed = false;
      try {
        execFileSync(process.execPath, [generatorPath, wasmPath, json, witness], {
          stdio: "pipe"
        });
        execFileSync("npx", ["--no-install", "snarkjs", "wtns", "check", r1csPath, witness], {
          stdio: "pipe"
        });
        passed = true;
      } catch (error) {
        if (test.shouldPass) {
          throw new Error(`${test.name}: unexpected witness failure: ${error.stderr?.toString() || error.message}`);
        }
      }

      if (passed !== test.shouldPass) {
        throw new Error(`${test.name}: expected ${test.shouldPass}, received ${passed}`);
      }

      console.log(`PASS: ${test.name} — circuit ${passed ? "accepted" : "rejected"}`);
    }

    console.log("5/5 ECHO V3 CIRCUIT GEOGRAPHIC TESTS PASSED");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
