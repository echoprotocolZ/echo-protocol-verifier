const fs = require("fs");
const hre = require("hardhat");
const snarkjs = require("snarkjs");
const { loadRecords } = require("./amoy-deployment-records");

async function main() {
  const dir = "build/v4-geographic-bound/proofs";
  const read = name => JSON.parse(
    fs.readFileSync(`${dir}/${name}`, "utf8")
  );

  const signed = read("v4-signed-checkpoint.json");
  const input = read("v3-amoy-authorization-input.json");

  const [v3A, v3B, v3C, v3Signals] = JSON.parse(
    `[${await snarkjs.groth16.exportSolidityCallData(
      read("v3-amoy-matching-proof.json"),
      read("v3-amoy-matching-public.json")
    )}]`
  );

  const [v4A, v4B, v4C, v4Signals] = JSON.parse(
    `[${await snarkjs.groth16.exportSolidityCallData(
      read("approved-zone-proof.json"),
      read("approved-zone-public.json")
    )}]`
  );

  const r = loadRecords().contracts;
  const provider = new hre.ethers.JsonRpcProvider(
    "https://polygon-amoy.drpc.org",
    80002,
    { batchMaxCount: 1, staticNetwork: true }
  );

  const [signer] = await hre.ethers.getSigners();

  if (hre.network.name !== "amoy") {
    throw new Error("Amoy network required");
  }

  if (
    signer.address.toLowerCase() !==
    "0xbD2dEf17C60C3f6C2dA6eE812F948f4B53f2f803".toLowerCase()
  ) {
    throw new Error("Wallet mismatch");
  }

  const checkpoint = signed.checkpoint;

  const account = new hre.ethers.Contract(
    r.EchoSmartAccountV4,
    [
      "function nonce() view returns (uint256)",
      "function executeAuthorized((address account,address delegatee,bytes32 zoneHash,bytes32 checkpointCommitment,bytes32 authorizationCommitment,uint64 timestamp,uint256 nonce),bytes,uint256[2],uint256[2][2],uint256[2],uint256[20],uint256[2],uint256[2][2],uint256[2],uint256[5],address,uint256,bytes) returns (bytes)"
    ],
    provider
  );

  const nonce = await account.nonce();

  const target = hre.ethers.getAddress(
    hre.ethers.toBeHex(BigInt(v3Signals[6]), 20)
  );

  const value = 0n;
  const callData = new hre.ethers.Interface(["function setValue(uint256)"]).encodeFunctionData("setValue", [888n]);

  console.log("=== STEP 637: FULL AUTHORIZATION SIMULATION ===");
  console.log("Network: Polygon Amoy");
  console.log("Smart account:", r.EchoSmartAccountV4);
  console.log("Validator:", signer.address);
  console.log("Smart account nonce:", nonce.toString());
  console.log("Checkpoint nonce:", checkpoint.nonce);
  console.log("V3 signals:", v3Signals.length);
  console.log("V4 signals:", v4Signals.length);

  if (BigInt(checkpoint.nonce) !== nonce) {
    throw new Error("Checkpoint nonce does not match smart account");
  }

  if (BigInt(v3Signals[11]) !== nonce) {
    throw new Error("V3 authorization nonce mismatch");
  }

  if (BigInt(v3Signals[6]) !== BigInt(target)) {
    throw new Error("V3 target mismatch");
  }

  if (BigInt(v3Signals[7]) !== value) {
    throw new Error("V3 value mismatch");
  }

  const dataHash = BigInt(hre.ethers.keccak256(callData));
  const mask = (1n << 128n) - 1n;

  if (
    BigInt(v3Signals[8]) !== (dataHash & mask) ||
    BigInt(v3Signals[9]) !== (dataHash >> 128n)
  ) {
    throw new Error("V3 callData hash mismatch");
  }

  console.log("Transaction binding: PASS");
  console.log("Calling executeAuthorized.staticCall...");

  try {
    const result = await account.executeAuthorized.staticCall(
      checkpoint,
      signed.signature,
      v3A, v3B, v3C, v3Signals,
      v4A, v4B, v4C, v4Signals,
      target,
      value,
      callData,
      { from: signer.address, gasLimit: 10000000n }
    );

    console.log("FULL AUTHORIZATION SIMULATION: PASS");
    console.log("Return data:", result);
  } catch (error) {
    console.log("FULL AUTHORIZATION SIMULATION: REVERTED");
    console.log("Reason:", error.shortMessage || error.message);
    if (error.data) console.log("Revert data:", error.data);
    process.exitCode = 1;
  }

  console.log("Transaction broadcast: NO");
  console.log("POL spent: 0");
}

main().catch(error => {
  console.error("ERROR:", error.shortMessage || error.message);
  process.exitCode = 1;
});
