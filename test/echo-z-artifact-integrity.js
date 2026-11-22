const assert = require("node:assert/strict");
const fs = require("node:fs");
const snarkjs = require("snarkjs");

const {
  CIRCUITS,
  resolveArtifacts
} = require("../scripts/zk/echo-proof-generator");

describe("Echo Z Groth16 artifact integrity", function () {
  this.timeout(120000);

  for (const version of ["v3", "v4"]) {
    it(`${version.toUpperCase()} verification key matches proving key`, async function () {
      const artifacts = resolveArtifacts(version);

      const storedKey = JSON.parse(
        fs.readFileSync(artifacts.vkey, "utf8")
      );

      const exportedKey =
        await snarkjs.zKey.exportVerificationKey(artifacts.zkey);

      assert.deepEqual(
        storedKey,
        exportedKey,
        `${version} verification key mismatch`
      );

      assert.equal(
        Number(storedKey.nPublic),
        CIRCUITS[version].publicInputs
      );

      assert.equal(
        storedKey.IC.length,
        CIRCUITS[version].publicInputs + 1
      );

      console.log(
        `PASS: ${version.toUpperCase()} artifact integrity`
      );
    });
  }
});
