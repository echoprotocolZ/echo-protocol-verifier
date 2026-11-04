
const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");

describe("Echo V3 real Groth16 proof", function () {
  it("verifies the 20-input proof in Solidity", async function () {
    const calldata = fs.readFileSync(
      "build/v3-timestamp-fixed/solidity-calldata.txt", "utf8"
    ).trim();

    const [a, b, c, signals] = JSON.parse("[" + calldata + "]");

    expect(signals.length).to.equal(20);

    const Verifier = await ethers.getContractFactory(
      "EchoAuthorizationVerifierV3"
    );

    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    const valid = await verifier.verifyProof(a, b, c, signals);
    expect(valid).to.equal(true);
  });
});
