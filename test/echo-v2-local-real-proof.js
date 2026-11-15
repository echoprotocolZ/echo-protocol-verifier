const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const fs = require("fs");
const assert = require("node:assert/strict");

describe("Echo V2 real Groth16 proof verification", function () {
  it("verifies the actual V2 proof locally in Solidity", async function () {
    const proof = JSON.parse(
      fs.readFileSync("build/v2/local-setup/proof.json", "utf8")
    );

    const publicSignals = JSON.parse(
      fs.readFileSync("build/v2/local-setup/public.json", "utf8")
    );

    const verificationKey = JSON.parse(
      fs.readFileSync("build/v2/local-setup/verification_key.json", "utf8")
    );

    assert.equal(publicSignals.length, 17);

    // First verify using snarkjs.
    const jsValid = await snarkjs.groth16.verify(
      verificationKey,
      publicSignals,
      proof
    );

    assert.equal(jsValid, true, "JavaScript proof verification failed");

    console.log("JavaScript Groth16 verification: PASSED");

    // Deploy the actual generated Solidity verifier locally.

    const abi = JSON.parse(fs.readFileSync("build/v2/local-setup/compiler/build_v2_local-setup_EchoAuthorizationVerifierV2_LocalVerifier_sol_Groth16Verifier.abi", "utf8"));
    const bytecode = "0x" + fs.readFileSync("build/v2/local-setup/compiler/build_v2_local-setup_EchoAuthorizationVerifierV2_LocalVerifier_sol_Groth16Verifier.bin", "utf8").trim();
    const [deployer] = await ethers.getSigners();
    const verifier = await new ethers.ContractFactory(
      abi, bytecode, deployer
    ).deploy();


    await verifier.waitForDeployment();

    // Convert proof into Solidity calldata format.
    const calldata = await snarkjs.groth16.exportSolidityCallData(
      proof,
      publicSignals
    );

    const args = JSON.parse("[" + calldata + "]");

    // Verify the same proof using Solidity.
    const solidityValid = await verifier.verifyProof(
      args[0],
      args[1],
      args[2],
      args[3]
    );

    assert.equal(solidityValid, true, "Solidity proof verification failed");

    console.log("Solidity Groth16 verification: PASSED");
    console.log("V2 verifier address:", await verifier.getAddress());
  });
});
