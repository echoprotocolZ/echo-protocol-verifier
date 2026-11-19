"use strict";
// Local-only circuit compile/witness regression; no trusted setup, proof, or deployment.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");

function run(bin, args) {
  const result = spawnSync(bin, args, { encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) {
    throw new Error(`${bin} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}
async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "echo-bootstrap-"));
  try {
    const circuit = path.resolve("circuits/v4/EchoBootstrapAuthorizationV1.circom");
    const circom = require.resolve("circom2/cli.js");
    console.log("BOOTSTRAP_STAGE: compile circuit");
    run(process.execPath, [circom, circuit, "-l", path.resolve("node_modules"), "--wasm", "--r1cs", "-o", tmp]);
    console.log("BOOTSTRAP_STAGE: compile complete");
    const wasm = path.join(tmp, "EchoBootstrapAuthorizationV1_js", "EchoBootstrapAuthorizationV1.wasm");
    const witness = path.join(tmp, "witness.wtns");
    const poseidon = await buildPoseidon();
    const hash = values => poseidon.F.toString(poseidon(values));
    const secret = 123456789n, salt = 987654321n;
    const account = 12345n, chainId = 31337n, bootstrapNonce = 0n, actionHash = 99999n;
    const trustedRoot = hash([secret, salt]);
    const expectedNullifier = hash([secret, account, chainId, bootstrapNonce, actionHash]);
    const valid = {
      trustedRoot, account: account.toString(), chainId: chainId.toString(),
      bootstrapNonce: bootstrapNonce.toString(), actionHash: actionHash.toString(),
      expectedNullifier, enrollmentSecret: secret.toString(), enrollmentSalt: salt.toString()
    };
    const good = path.join(tmp, "good.json");
    fs.writeFileSync(good, JSON.stringify(valid));
    console.log("BOOTSTRAP_STAGE: calculate valid witness");
    await snarkjs.wtns.calculate(valid, wasm, witness);
    console.log("BOOTSTRAP_STAGE: witness calculated");
    assert.equal(await snarkjs.wtns.check(path.join(tmp, "EchoBootstrapAuthorizationV1.r1cs"), witness), true);
    console.log("BOOTSTRAP_STAGE: tamper checks");
    for (const [field, badValue] of [
      ["trustedRoot", "1"], ["expectedNullifier", "1"], ["account", "54321"],
      ["chainId", "137"], ["bootstrapNonce", "1"], ["actionHash", "88888"]
    ]) {
      console.log("BOOTSTRAP_STAGE: tamper", field);
      const invalid = { ...valid, [field]: badValue };
      let rejected = false;
      try {
        await snarkjs.wtns.calculate(invalid, wasm, witness);
        rejected = !(await snarkjs.wtns.check(path.join(tmp, "EchoBootstrapAuthorizationV1.r1cs"), witness));
      } catch (_) { rejected = true; }
      assert.equal(rejected, true, `tampered ${field} must fail`);
    }
    process.stdout.write("PASS bootstrap circuit compile, valid witness and 6 tampering checks (NO GROTH16 PROOF)\n");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
