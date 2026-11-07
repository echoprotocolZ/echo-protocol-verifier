const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const { loadRecords } = require("./amoy-deployment-records");

async function main() {
  const base = "build/v4-geographic-bound";

  const wasm =
    `${base}/EchoGeographicBoundV4_js/EchoGeographicBoundV4.wasm`;

  const zkey =
    `${base}/setup/EchoGeographicBoundV4_final.zkey`;

  const zone = {
    minLat: "1200000000",
    maxLat: "1200010000",
    minLon: "600000000",
    maxLon: "600010000"
  };

  const checkpointLat = "1200005000";
  const checkpointLon = "600005000";
  const checkpointTimestamp = String((await hre.ethers.provider.getBlock("latest")).timestamp);

  const poseidon = await buildPoseidon();

  const commitment = poseidon.F.toString(
    poseidon([
      BigInt(checkpointLat),
      BigInt(checkpointLon),
      BigInt(checkpointTimestamp)
    ])
  );

  const input = {
    checkpointLat,
    checkpointLon,
    checkpointTimestamp,
    ...zone,
    expectedCheckpointCommitment: commitment
  };

  console.log("Generating genuine Groth16 proof...");

  const { proof, publicSignals } =
    await snarkjs.groth16.fullProve(input, wasm, zkey);

  const vk = await snarkjs.zKey.exportVerificationKey(zkey);

  const locallyValid = await snarkjs.groth16.verify(
    vk,
    publicSignals,
    proof
  );

  if (!locallyValid) {
    throw new Error("Local Groth16 verification failed");
  }

  const expectedSignals = [
    zone.minLat,
    zone.maxLat,
    zone.minLon,
    zone.maxLon,
    commitment
  ];

  if (
    publicSignals.length !== 5 ||
    !publicSignals.every(
      (value, index) =>
        BigInt(value) === BigInt(expectedSignals[index])
    )
  ) {
    throw new Error("Generated public signals mismatch");
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
    r.EchoGeographicBoundVerifierV4,
    [
      "function verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[5]) view returns (bool)"
    ],
    provider
  );

  const accepted = await verifier.verifyProof(
    a, b, c, signals
  );

  if (!accepted) {
    throw new Error("Deployed verifier rejected generated proof");
  }

  const outputDir = `${base}/proofs`;
  fs.mkdirSync(outputDir, { recursive: true });

  const proofPath = path.join(
    outputDir,
    "approved-zone-proof.json"
  );

  const signalsPath = path.join(
    outputDir,
    "approved-zone-public.json"
  );

  fs.writeFileSync(
    proofPath,
    JSON.stringify(proof, null, 2)
  );

  fs.writeFileSync(
    signalsPath,
    JSON.stringify(publicSignals, null, 2)
  );

  const zoneDomain = hre.ethers.id(
    "ECHO_V4_GEOGRAPHIC_ZONE_V1"
  );

  const zoneHash = hre.ethers.keccak256(
    hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint32", "uint32", "uint32", "uint32"],
      [
        zoneDomain,
        zone.minLat,
        zone.maxLat,
        zone.minLon,
        zone.maxLon
      ]
    )
  );

  const expectedZoneHash =
    "0x779dbc9b263b67e52c604312d097e324ce4c75c90cfa2185d4be0ce5b31fcb76";

  if (zoneHash.toLowerCase() !== expectedZoneHash.toLowerCase()) {
    throw new Error("Approved zone hash mismatch");
  }

  const compatiblePath = path.join(outputDir, "v3-compatible-checkpoint.json");
  const compatible = JSON.parse(fs.readFileSync(compatiblePath, "utf8"));
  if (compatible.checkpointX !== checkpointLat || compatible.checkpointY !== checkpointLon) throw new Error("Checkpoint coordinates mismatch");
  compatible.checkpointTimestamp = checkpointTimestamp;
  compatible.expectedCheckpointCommitment = commitment;
  fs.writeFileSync(compatiblePath, JSON.stringify(compatible, null, 2) + "\n");

  console.log("Local Groth16 verification: PASS");
  console.log("On-chain Groth16 verification: PASS");
  console.log("Approved zone hash:", zoneHash);
  console.log("Checkpoint commitment:", commitment);
  console.log("Proof saved:", proofPath);
  console.log("Public signals saved:", signalsPath);
  console.log("Transaction broadcast: NO");
  console.log("POL spent: 0");
  console.log("SUCCESS: APPROVED-ZONE V4 PROOF GENERATED AND VERIFIED");
}

main().catch(error => {
  console.error("ERROR:", error.shortMessage || error.message);
  process.exitCode = 1;
});
