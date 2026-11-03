const fs = require("fs");
const { buildPoseidon } = require("circomlibjs");

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const hash = (...values) =>
    F.toString(poseidon(values.map((v) => BigInt(v))));

  // Test-only values. These are not real wallet or authorization data.
  const input = {
    account: "1001",
    validator: "2002",
    target: "3003",
    value: "100",
    calldataHashLow: "12345",
    calldataHashHigh: "67890",
    chainId: "137",
    nonce: "1",
    deadline: "2000000000",

    targetX: "100000",
    targetY: "200000",
    maxDistanceSq: "10000",
    minTimestamp: "1700000000",
    maxTimestamp: "1900000000",

    fragmentPayload: "42",
    fragmentSalt: "123456",
    checkpointX: "100050",
    checkpointY: "200000",
    checkpointTimestamp: "1800000000"
  };

  input.expectedFragmentCommitment = hash(
    input.fragmentPayload,
    input.fragmentSalt
  );

  input.expectedAuthorizationCommitment = hash(
    input.account,
    input.validator,
    input.target,
    input.value,
    input.calldataHashLow,
    input.calldataHashHigh,
    input.chainId,
    input.nonce,
    input.deadline,
    input.expectedFragmentCommitment,
    input.targetX,
    input.targetY,
    input.maxDistanceSq,
    input.minTimestamp,
    input.maxTimestamp
  );

  input.expectedNullifier = hash(
    input.account,
    input.expectedAuthorizationCommitment
  );

  fs.writeFileSync(
    "build/v2/input.json",
    JSON.stringify(input, null, 2)
  );

  console.log("V2 test input created: build/v2/input.json");
  console.log("Fragment commitment:", input.expectedFragmentCommitment);
  console.log("Authorization commitment:", input.expectedAuthorizationCommitment);
  console.log("Nullifier:", input.expectedNullifier);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
