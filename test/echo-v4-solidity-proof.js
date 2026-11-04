const assert = require("node:assert/strict");
const fs = require("node:fs");
const { ethers } = require("hardhat");

describe("ECHO V4 Solidity Geographic Proof Verification", function () {
  let verifier;
  let proof;
  let signals;

  before(async function () {
    const base = "build/v4-geographic-bound/proofs/";

    proof = JSON.parse(
      fs.readFileSync(base + "valid-proof.json", "utf8")
    );

    signals = JSON.parse(
      fs.readFileSync(base + "valid-public.json", "utf8")
    ).map(BigInt);

    assert.equal(signals.length, 5);

    const Factory = await ethers.getContractFactory(
      "EchoGeographicBoundVerifierV4"
    );

    verifier = await Factory.deploy();
    await verifier.waitForDeployment();
  });

  function proofArgs(publicSignals = signals) {
    return [
      proof.pi_a.slice(0, 2),
      [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]]
      ],
      proof.pi_c.slice(0, 2),
      publicSignals
    ];
  }

  it("accepts the valid V4 geographic proof", async function () {
    assert.equal(
      await verifier.verifyProof(...proofArgs()),
      true
    );
  });

  const names = [
    "minimum latitude",
    "maximum latitude",
    "minimum longitude",
    "maximum longitude",
    "checkpoint commitment"
  ];

  names.forEach((name, index) => {
    it(`rejects modified ${name}`, async function () {
      const modified = [...signals];
      modified[index] += 1n;

      let accepted = false;

      try {
        accepted = await verifier.verifyProof(
          ...proofArgs(modified)
        );
      } catch (error) {
        // A verifier revert also rejects the invalid proof.
      }

      assert.equal(accepted, false);
    });
  });
});
