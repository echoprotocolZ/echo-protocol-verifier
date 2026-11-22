const fs = require("node:fs");
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

describe("ECHO V3/V4 actual Solidity Groth16 positive proof equivalence (local)", function () {
  it("accepts both supplied positive proofs on their generated Solidity verifier contracts", async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    for (const [label, folder, contractName, count] of [
      ["V3", "build/v3-timestamp-fixed", "EchoAuthorizationVerifierV3", 20],
      ["V4", "build/v4-geographic-bound", "EchoGeographicBoundVerifierV4", 5]
    ]) {
      const paths = ["proof.json", "public.json"].map(file => folder + "/" + file);
      for (const file of paths) assert.ok(fs.existsSync(file), label + " missing " + file);
      const proof = JSON.parse(fs.readFileSync(paths[0], "utf8"));
      const signals = JSON.parse(fs.readFileSync(paths[1], "utf8"));
      assert.equal(signals.length, count, label + " public signal count");
      const a = proof.pi_a.slice(0, 2);
      const b = [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]]
      ];
      const c = proof.pi_c.slice(0, 2);
      const verifier = await (await ethers.getContractFactory(contractName)).deploy();
      await verifier.waitForDeployment();
      assert.equal(await verifier.verifyProof(a, b, c, signals), true,
        label + " proof accepted by snarkjs but rejected by Solidity verifier");
      console.log("PASS:", label, "actual Solidity verifier accepted positive proof");
    }
  });
});
