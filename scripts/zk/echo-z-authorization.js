const fs = require("node:fs");
const { buildPoseidon } = require("circomlibjs");
const { generateDualProof } = require("./echo-z-proof-utils");

async function buildAuthorization({
  ethers,
  account,
  agent,
  validator,
  registry,
  target,
  value,
  data,
  zone,
  zoneHash,
  deadline
}) {
  const poseidon = await buildPoseidon();

  const hash = values => BigInt(
    poseidon.F.toString(poseidon(values))
  );

  const network = await ethers.provider.getNetwork();
  const block = await ethers.provider.getBlock("latest");

  const timestamp = BigInt(block.timestamp);
  const nonce = await account.nonce();

  const minTimestamp = timestamp - 3600n;
  const maxTimestamp = timestamp + 3600n;

  const base = JSON.parse(
    fs.readFileSync(
      "build/v3-bound/input-local.json",
      "utf8"
    )
  );

  const calldataHash = BigInt(ethers.keccak256(data));
  const mask = (1n << 128n) - 1n;

  const fragmentPayload = BigInt(base.fragmentPayload);
  const fragmentSalt = BigInt(base.fragmentSalt);
  const checkpointX = BigInt(base.checkpointX);
  const checkpointY = BigInt(base.checkpointY);
  const targetX = BigInt(base.targetX);
  const targetY = BigInt(base.targetY);
  const maxDistanceSq = BigInt(base.maxDistanceSq);

  const fragmentCommitment = hash([
    fragmentPayload,
    fragmentSalt
  ]);

  const checkpointCommitment = hash([
    checkpointX,
    checkpointY,
    timestamp
  ]);

  const authorizationHash1 = hash([
    BigInt(account.target),
    BigInt(agent.address),
    BigInt(validator.address),
    BigInt(target),
    BigInt(value),
    calldataHash & mask,
    calldataHash >> 128n,
    BigInt(network.chainId),
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
    BigInt(account.target),
    authorizationCommitment
  ]);

  const v3Input = {
    expectedFragmentCommitment: fragmentCommitment,
    expectedCheckpointCommitment: checkpointCommitment,
    expectedCheckpointTimestamp: timestamp,
    expectedAuthorizationCommitment: authorizationCommitment,
    expectedNullifier: nullifier,
    account: BigInt(account.target),
    delegatee: BigInt(agent.address),
    validator: BigInt(validator.address),
    target: BigInt(target),
    value: BigInt(value),
    calldataHashLow: calldataHash & mask,
    calldataHashHigh: calldataHash >> 128n,
    chainId: BigInt(network.chainId),
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

  const v4Input = {
    checkpointLat: checkpointX.toString(),
    checkpointLon: checkpointY.toString(),
    checkpointTimestamp: timestamp.toString(),
    minLat: zone.minLat.toString(),
    maxLat: zone.maxLat.toString(),
    minLon: zone.minLon.toString(),
    maxLon: zone.maxLon.toString(),
    expectedCheckpointCommitment:
      checkpointCommitment.toString()
  };

  const proof = await generateDualProof(
    v3Input,
    v4Input
  );

  const checkpoint = {
    account: account.target,
    delegatee: agent.address,
    zoneHash,
    checkpointCommitment: ethers.toBeHex(
      checkpointCommitment,
      32
    ),
    authorizationCommitment: ethers.toBeHex(
      authorizationCommitment,
      32
    ),
    timestamp,
    nonce
  };

  const types = {
    SignedCheckpoint: [
      { name: "account", type: "address" },
      { name: "delegatee", type: "address" },
      { name: "zoneHash", type: "bytes32" },
      { name: "checkpointCommitment", type: "bytes32" },
      { name: "authorizationCommitment", type: "bytes32" },
      { name: "timestamp", type: "uint64" },
      { name: "nonce", type: "uint256" }
    ]
  };

  const domain = {
    name: "EchoAttestationRegistryV3",
    version: "1",
    chainId: network.chainId,
    verifyingContract: registry.target
  };

  const signature = await validator.signTypedData(
    domain,
    types,
    checkpoint
  );

  return {
    checkpoint,
    signature,
    proof,
    nonce,
    timestamp
  };
}

module.exports = { buildAuthorization };
