const fs = require("fs");
const hre = require("hardhat");
const snarkjs = require("snarkjs");
const { loadRecords } = require("./amoy-deployment-records");

async function main() {
  const dir = "build/v3-timestamp-fixed";
  const outputDir = "build/v4-geographic-bound/proofs";

  const input = JSON.parse(
    fs.readFileSync(
      `${outputDir}/v3-amoy-authorization-input.json`,
      "utf8"
    )
  );

  const v4Signals = JSON.parse(
    fs.readFileSync(
      `${outputDir}/approved-zone-public.json`,
      "utf8"
    )
  );

  const wasm =
    `${dir}/EchoAuthorizationVerifierV3_js/EchoAuthorizationVerifierV3.wasm`;

  const zkey =
    `${dir}/EchoAuthorizationVerifierV3_final.zkey`;

  console.log("Generating genuine V3 Groth16 proof...");

  const { proof, publicSignals } =
    await snarkjs.groth16.fullProve(input, wasm, zkey);

  const vk = await snarkjs.zKey.exportVerificationKey(zkey);

  const locallyValid = await snarkjs.groth16.verify(
    vk,
    publicSignals,
    proof
  );

  if (!locallyValid) {
    throw new Error("Local V3 proof verification failed");
  }

  if (publicSignals.length !== 20) {
    throw new Error("Expected 20 V3 public signals");
  }

  if (
    BigInt(publicSignals[18]) !==
    BigInt(v4Signals[4])
  ) {
    throw new Error("V3/V4 checkpoint commitment mismatch");
  }

  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proof,
    publicSignals
  );

  const [a, b, c, signals] = JSON.parse(`[${calldata}]`);

  const provider = new hre.ethers.JsonRpcProvider(
    "https://polygon-amoy.drpc.org",
    80002,
    { batchMaxCount: 1, staticNetwork: true }
  );

  const r = loadRecords().contracts;

  const verifier = new hre.ethers.Contract(
    r.EchoAuthorizationVerifierV3,
    [
      "function verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[20]) view returns (bool)"
    ],
    provider
  );

  const accepted = await verifier.verifyProof(
    a, b, c, signals
  );

  console.log("Local V3 Groth16 verification:", locallyValid);
  console.log("On-chain V3 verifier accepted proof:", accepted);
  console.log(
    "V3/V4 checkpoint commitment matches:",
    BigInt(publicSignals[18]) === BigInt(v4Signals[4])
  );

  if (!accepted) {
    throw new Error("Deployed V3 verifier rejected proof");
  }

  fs.writeFileSync(
    `${outputDir}/v3-amoy-matching-proof.json`,
    JSON.stringify(proof, null, 2)
  );

  fs.writeFileSync(
    `${outputDir}/v3-amoy-matching-public.json`,
    JSON.stringify(publicSignals, null, 2)
  );

  console.log("V3 proof files saved: YES");
  console.log("Transaction broadcast: NO");
  console.log("POL spent: 0");
  console.log("SUCCESS: MATCHING V3 AUTHORIZATION PROOF VERIFIED ON AMOY");
}

main().catch(error => {
  console.error("ERROR:", error.shortMessage || error.message);
  process.exitCode = 1;
});
