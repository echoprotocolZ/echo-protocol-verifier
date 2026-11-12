const assert = require("node:assert/strict");
const fs = require("node:fs");
const snarkjs = require("snarkjs");
const { ethers } = require("hardhat");

describe("Echo V4 real Groth16 valid-proof integration", function () {
  this.timeout(180000);
  const zkey = "build/v4-geographic-bound/setup/EchoGeographicBoundV4_final.zkey";
  const witness = "build/v4-geographic-bound/tests/valid-checkpoint.wtns";

  it("generates a valid proof and verifies it in the real Solidity V4 verifier", async function () {
    assert.ok(fs.existsSync(zkey), "Missing V4 proving key: " + zkey);
    assert.ok(fs.existsSync(witness), "Missing V4 witness: " + witness);
    assert.ok(fs.statSync(witness).size > 0, "V4 witness is empty");

    // A valid witness and matching zkey must produce a proof that verifies
    // off-chain AND against the deployed Hardhat Solidity verifier.
    const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, witness);
    assert.equal(publicSignals.length, 5, "Expected exactly five V4 public signals");
    const vk = await snarkjs.zKey.exportVerificationKey(zkey);
    assert.equal(await snarkjs.groth16.verify(vk, publicSignals, proof), true,
      "Generated proof failed snarkjs verification");

    const verifier = await (await ethers.getContractFactory("EchoGeographicBoundVerifierV4")).deploy();
    await verifier.waitForDeployment();
    const calldata = JSON.parse("[" + await snarkjs.groth16.exportSolidityCallData(proof, publicSignals) + "]");
    assert.equal(await verifier.verifyProof(...calldata), true,
      "Generated proof failed real Solidity V4 verification");

    const modified = [...publicSignals];
    modified[0] = (BigInt(modified[0]) + 1n).toString();
    assert.equal(await verifier.verifyProof(calldata[0], calldata[1], calldata[2], modified), false,
      "Tampered public signal must invalidate the real Groth16 proof");
  });
});
