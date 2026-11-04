const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const base = "build/v4-geographic";
const generator = `${base}/EchoGeographicZoneV4_js/generate_witness.js`;
const wasm = `${base}/EchoGeographicZoneV4_js/EchoGeographicZoneV4.wasm`;
const r1cs = `${base}/EchoGeographicZoneV4.r1cs`;
const snarkjs = path.resolve("node_modules/.bin/snarkjs");

const zone = {
  minLat: "1200000000",
  maxLat: "1210000000",
  minLon: "2400000000",
  maxLon: "2410000000"
};

const cases = [
  ["Inside zone", "1205000000", "2405000000", true],
  ["Minimum boundary", "1200000000", "2400000000", true],
  ["Maximum boundary", "1210000000", "2410000000", true],
  ["Outside latitude", "1210000001", "2405000000", false],
  ["Outside longitude", "1205000000", "2410000001", false],
  ["Invalid GPS latitude", "1800000001", "2405000000", false],
  ["Invalid GPS longitude", "1205000000", "3600000001", false],
  ["Reversed boundaries", "1205000000", "2405000000", false,
    { minLat: "1210000000", maxLat: "1200000000" }],
  ["Invalid zone latitude", "1205000000", "2405000000", false,
    { maxLat: "1800000001" }],
  ["Invalid zone longitude", "1205000000", "2405000000", false,
    { maxLon: "3600000001" }]
];

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "echo-v4-tests-"));

let passed = 0;

try {
  for (let i = 0; i < cases.length; i++) {
    const [name, lat, lon, expected, overrides = {}] = cases[i];

    const input = {
      checkpointLat: lat,
      checkpointLon: lon,
      ...zone,
      ...overrides
    };

    const inputFile = path.join(temp, `case-${i}.json`);
    const witnessFile = path.join(temp, `case-${i}.wtns`);

    fs.writeFileSync(inputFile, JSON.stringify(input));

    const generated = spawnSync(
      process.execPath,
      [generator, wasm, inputFile, witnessFile],
      { encoding: "utf8" }
    );

    let accepted = false;

    if (generated.status === 0) {
      const checked = spawnSync(
        snarkjs,
        ["wtns", "check", r1cs, witnessFile],
        { encoding: "utf8" }
      );

      if (checked.error) throw checked.error;

      accepted = checked.status === 0 &&
        checked.stdout.includes("WITNESS IS CORRECT");
    } else if (generated.error) {
      throw generated.error;
    }

    if (accepted !== expected) {
      console.error(`FAIL: ${name}`);
      process.exitCode = 1;
    } else {
      console.log(`PASS: ${name} — ${accepted ? "accepted" : "rejected"}`);
      passed++;
    }
  }

  console.log(`${passed}/${cases.length} V4 CIRCUIT TESTS PASSED`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
