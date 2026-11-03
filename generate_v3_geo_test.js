const fs = require("fs");
const { buildPoseidon } = require("circomlibjs");

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const hash = (...values) =>
    F.toString(poseidon(values.map(v => BigInt(v))));

  // Demonstration inputs only
  const input = {
    account: "1001",
    delegatee: "4004",
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

    checkpointX: "200000",
    checkpointY: "200000",
    checkpointTimestamp: "1950000000"
  };

  // Fragment commitment
  const fragmentCommitment = hash(
    input.fragmentPayload,
    input.fragmentSalt
  );

  // Checkpoint commitment
  const checkpointCommitment = hash(
    input.checkpointX,
    input.checkpointY,
    input.checkpointTimestamp
  );

  // Authorization hash
  const authorizationHashPart1 = hash(
    input.account,
    input.delegatee,
    input.validator,
    input.target,
    input.value,
    input.calldataHashLow,
    input.calldataHashHigh,
    input.chainId,
    input.nonce,
    input.deadline,
    fragmentCommitment,
    input.targetX,
    input.targetY,
    input.maxDistanceSq,
    input.minTimestamp,
    input.maxTimestamp
  );

  const authorizationCommitment = hash(
    authorizationHashPart1,
    checkpointCommitment
  );

  // Nullifier
  const nullifier = hash(
    input.account,
    authorizationCommitment
  );

  input.expectedFragmentCommitment = fragmentCommitment;
  input.expectedAuthorizationCommitment =
    authorizationCommitment;
  input.expectedNullifier = nullifier;

  // Save input for the replacement circuit
  const outputDir = "build/v3-replacement";
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    `${outputDir}/input-time-test.json`,
    JSON.stringify(input, null, 2)
  );

  console.log("V3 replacement input created successfully.");
  console.log("Input:", `${outputDir}/input.json`);
  console.log("Expected public inputs: 18");
  console.log("Expected private inputs: 5");
}

main().catch(error => {
  console.error("Input generation failed:", error);
  process.exit(1);
});
