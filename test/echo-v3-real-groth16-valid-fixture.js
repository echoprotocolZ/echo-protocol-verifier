const assert = require("node:assert/strict");
const fs = require("node:fs");
const snarkjs = require("snarkjs");
const { ethers } = require("hardhat");

describe("Echo V3 real Groth16 positive proof fixture", function () {
  this.timeout(180000);
  const zkey = "build/v3-timestamp-fixed/EchoAuthorizationVerifierV3_final.zkey";
  const proofFile = "build/v3-timestamp-fixed/proof.json";
  const publicFile = "build/v3-timestamp-fixed/public.json";

  it("verifies existing V3 proof off-chain and in the real Solidity verifier; rejects tampering", async function () {
    for (const file of [zkey, proofFile, publicFile]) {
      assert.ok(fs.existsSync(file), "Missing required V3 fixture: " + file);
      assert.ok(fs.statSync(file).size > 0, "Empty required V3 fixture: " + file);
    }
    const proof = JSON.parse(fs.readFileSync(proofFile, "utf8"));
    const publicSignals = JSON.parse(fs.readFileSync(publicFile, "utf8"));
    assert.equal(publicSignals.length, 20, "V3 verifier expects 20 public signals");
    const vk = await snarkjs.zKey.exportVerificationKey(zkey);
    assert.equal(await snarkjs.groth16.verify(vk, publicSignals, proof), true,
      "Saved V3 proof must verify against the matching proving key's verification key");

    const verifier = await (await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
    await verifier.waitForDeployment();
    const calldata = JSON.parse("[" + await snarkjs.groth16.exportSolidityCallData(proof, publicSignals) + "]");
    assert.equal(await verifier.verifyProof(...calldata), true,
      "Saved V3 proof must verify in the real Solidity V3 verifier");

    const tampered = [...publicSignals];
    tampered[0] = (BigInt(tampered[0]) + 1n).toString();
    assert.equal(await verifier.verifyProof(calldata[0], calldata[1], calldata[2], tampered), false,
      "Tampering with a public signal must invalidate the proof");
  });
});
