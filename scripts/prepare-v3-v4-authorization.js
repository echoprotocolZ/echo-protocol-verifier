const fs = require("fs");
const hre = require("hardhat");
const { buildPoseidon } = require("circomlibjs");
const { loadRecords } = require("./amoy-deployment-records");

async function main() {
  const provider = new hre.ethers.JsonRpcProvider(
    "https://polygon-amoy.drpc.org",
    80002,
    { batchMaxCount: 1, staticNetwork: true }
  );

  const network = await provider.getNetwork();
  if (network.chainId !== 80002n) {
    throw new Error("Polygon Amoy required");
  }

  const r = loadRecords().contracts;
  const account = r.EchoSmartAccountV4;

  const delegatee =
    "0xbD2dEf17C60C3f6C2dA6eE812F948f4B53f2f803";

  const template = JSON.parse(
    fs.readFileSync("build/v3-bound/input-local.json", "utf8")
  );

  const compatible = JSON.parse(
    fs.readFileSync(
      "build/v4-geographic-bound/proofs/v3-compatible-checkpoint.json",
      "utf8"
    )
  );

  const v4Signals = JSON.parse(
    fs.readFileSync(
      "build/v4-geographic-bound/proofs/approved-zone-public.json",
      "utf8"
    )
  );

  const poseidon = await buildPoseidon();
  const hash = values => BigInt(
    poseidon.F.toString(poseidon(values))
  );

  const checkpointX = BigInt(compatible.checkpointX);
  const checkpointY = BigInt(compatible.checkpointY);
  const timestamp = BigInt(compatible.checkpointTimestamp);

  const checkpointCommitment = hash([
    checkpointX,
    checkpointY,
    timestamp
  ]);

  if (
    checkpointCommitment !== BigInt(v4Signals[4]) ||
    checkpointCommitment !==
      BigInt(compatible.expectedCheckpointCommitment)
  ) {
    throw new Error("V3/V4 checkpoint commitment mismatch");
  }

  const latest = await provider.getBlock("latest");
  if (!latest) throw new Error("Latest Amoy block unavailable");

  const currentTimestamp = BigInt(latest.timestamp);

  const nonce = await new hre.ethers.Contract(account, ["function nonce() view returns (uint256)"], provider).nonce();
  const deadline = currentTimestamp + 7200n;
  const minTimestamp = timestamp - 3600n;
  const maxTimestamp = timestamp + 3600n;

  const fragmentPayload = BigInt(template.fragmentPayload);
  const fragmentSalt = BigInt(template.fragmentSalt);
  const targetX = BigInt(compatible.targetX);
  const targetY = BigInt(compatible.targetY);
  const maxDistanceSq = BigInt(compatible.maxDistanceSq);

  const fragmentCommitment = hash([
    fragmentPayload,
    fragmentSalt
  ]);

  const target = r.TestTarget;
  if (!target || await provider.getCode(target) === "0x") {
    throw new Error("TestTarget not deployed on Amoy");
  }
  const value = 0n;
  const callData = new hre.ethers.Interface(
    ["function setValue(uint256)"]
  ).encodeFunctionData("setValue", [888n]);
  const calldataHash = BigInt(hre.ethers.keccak256(callData));
  const mask = (1n << 128n) - 1n;

  // For this witness-preparation exercise, the deployment
  // wallet is also used as the synthetic validator.
  const validator = delegatee;

  const authorizationHash1 = hash([
    BigInt(account),
    BigInt(delegatee),
    BigInt(validator),
    BigInt(target),
    value,
    calldataHash & mask,
    calldataHash >> 128n,
    network.chainId,
    nonce,
    deadline,
    fragmentCommitment,
    targetX,
    targetY,
    maxDistanceSq,
    minTimestamp,
    maxTimestamp
  ]);

  const authorizationCommitment = hash([
    authorizationHash1,
    checkpointCommitment
  ]);

  const nullifier = hash([
    BigInt(account),
    authorizationCommitment
  ]);

  const input = {
    expectedFragmentCommitment: fragmentCommitment,
    expectedCheckpointCommitment: checkpointCommitment,
    expectedCheckpointTimestamp: timestamp,
    expectedAuthorizationCommitment: authorizationCommitment,
    expectedNullifier: nullifier,
    account: BigInt(account),
    delegatee: BigInt(delegatee),
    validator: BigInt(validator),
    target: BigInt(target),
    value,
    calldataHashLow: calldataHash & mask,
    calldataHashHigh: calldataHash >> 128n,
    chainId: network.chainId,
    nonce,
    deadline,
    targetX,
    targetY,
    maxDistanceSq,
    minTimestamp,
    maxTimestamp,
    fragmentPayload,
    fragmentSalt,
    checkpointX,
    checkpointY,
    checkpointTimestamp: timestamp
  };

  const stringify = obj => JSON.parse(
    JSON.stringify(
      obj,
      (_, v) => typeof v === "bigint" ? v.toString() : v
    )
  );

  const outputFile =
    "build/v4-geographic-bound/proofs/v3-amoy-authorization-input.json";

  fs.writeFileSync(
    outputFile,
    JSON.stringify(stringify(input), null, 2)
  );

  console.log("Network: Polygon Amoy");
  console.log("Smart account:", account);
  console.log("Delegatee:", delegatee);
  console.log("Synthetic validator:", validator);
  console.log("Checkpoint commitment:", checkpointCommitment.toString());
  console.log("V3/V4 checkpoint binding: PASS");
  console.log("V3 witness saved:", outputFile);
  console.log("Transaction broadcast: NO");
  console.log("POL spent: 0");
  console.log("SUCCESS: V3 AMOY AUTHORIZATION WITNESS PREPARED");
}

main().catch(error => {
  console.error("ERROR:", error.shortMessage || error.message);
  process.exitCode = 1;
});
