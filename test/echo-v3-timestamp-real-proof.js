const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");
const snarkjs = require("snarkjs");

describe("ECHO V3 timestamp-bound real Groth16 proof", function () {
  it("verifies the updated 20-signal proof on Solidity", async function () {
    const dir = "build/v3-timestamp-fixed";

    const proof = JSON.parse(
      fs.readFileSync(`${dir}/proof.json`, "utf8")
    );

    const signals = JSON.parse(
      fs.readFileSync(`${dir}/public.json`, "utf8")
    );

    expect(signals.length).to.equal(20);

    const calldata = await snarkjs.groth16.exportSolidityCallData(
      proof,
      signals
    );

    const [a, b, c, publicSignals] = JSON.parse(`[${calldata}]`);

    const Verifier = await ethers.getContractFactory(
      "EchoAuthorizationVerifierV3"
    );

    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    expect(
      await verifier.verifyProof(a, b, c, publicSignals)
    ).to.equal(true);

    const alteredSignals = [...publicSignals];
    alteredSignals[19] = (
      BigInt(alteredSignals[19]) + 60n
    ).toString();

    expect(
      await verifier.verifyProof(a, b, c, alteredSignals)
    ).to.equal(false);
  });
});
