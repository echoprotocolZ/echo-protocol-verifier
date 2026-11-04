const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const base = "build/v4-geographic-bound";
const original = JSON.parse(
  fs.readFileSync(`${base}/tests/valid-checkpoint.json`, "utf8")
);

const cases = [
  ["Valid checkpoint", {}, true],
  ["Modified latitude", { checkpointLat: "1205000001" }, false],
  ["Modified longitude", { checkpointLon: "2405000001" }, false],
  ["Modified timestamp", { checkpointTimestamp: "1700000001" }, false],
  ["Modified commitment", {
    expectedCheckpointCommitment:
      (BigInt(original.expectedCheckpointCommitment) + 1n).toString()
  }, false],
  ["Outside zone", { checkpointLat: "1210000001" }, false],
  ["Invalid GPS latitude", { checkpointLat: "1800000001" }, false],
  ["Reversed zone boundaries", {
    minLat: "1210000000",
    maxLat: "1200000000"
  }, false]
];

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "echo-v4-bound-"));
let passed = 0;

try {
  for (let i = 0; i < cases.length; i++) {
    const [name, changes, expected] = cases[i];
    const inputFile = path.join(temp, `input-${i}.json`);
    const witnessFile = path.join(temp, `witness-${i}.wtns`);

    fs.writeFileSync(inputFile, JSON.stringify({
      ...original,
      ...changes
    }));

    const generated = spawnSync(process.execPath, [
      `${base}/EchoGeographicBoundV4_js/generate_witness.js`,
      `${base}/EchoGeographicBoundV4_js/EchoGeographicBoundV4.wasm`,
      inputFile,
      witnessFile
    ], { encoding: "utf8" });

    if (generated.error) throw generated.error;

    let accepted = false;

    if (generated.status === 0) {
      const checked = spawnSync("npx", [
        "--no-install", "snarkjs", "wtns", "check",
        `${base}/EchoGeographicBoundV4.r1cs`,
        witnessFile
      ], { encoding: "utf8" });

      if (checked.error) throw checked.error;

      accepted = checked.status === 0 &&
        checked.stdout.includes("WITNESS IS CORRECT");
    }

    if (accepted === expected) {
      console.log(`PASS: ${name} — ${accepted ? "accepted" : "rejected"}`);
      passed++;
    } else {
      console.error(`FAIL: ${name}`);
      process.exitCode = 1;
    }
  }

  console.log(`${passed}/${cases.length} V4 CHECKPOINT SECURITY TESTS PASSED`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
