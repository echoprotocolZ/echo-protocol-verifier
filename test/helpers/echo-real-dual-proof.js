const fs = require("node:fs");
const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");

const ZONE = Object.freeze({ minLat: 100000, maxLat: 101000, minLon: 199000, maxLon: 201000 });
const TYPES = { SignedCheckpoint: [
  { name: "account", type: "address" },
  { name: "delegatee", type: "address" },
  { name: "zoneHash", type: "bytes32" },
  { name: "checkpointCommitment", type: "bytes32" },
  { name: "authorizationCommitment", type: "bytes32" },
  { name: "timestamp", type: "uint64" },
  { name: "nonce", type: "uint256" }
] };
const stringify = obj => JSON.parse(JSON.stringify(obj, (_, v) => typeof v === "bigint" ? v.toString() : v));

/**
 * Generate genuinely verified V3 and V4 Groth16 proofs for ONE exact execution.
 * Proofs cannot be reused with a different target, calldata, account or nonce.
 * Requires local circuit artifacts from the existing V4 real-dual-proof test.
 */
async function proveAuthorizedCall({ account, delegatee, validator, registry, target, data, value = 0n, nonce, zone = ZONE }) {
  const base = JSON.parse(fs.readFileSync("build/v3-bound/input-local.json", "utf8"));
  const poseidon = await buildPoseidon();
  const hash = values => BigInt(poseidon.F.toString(poseidon(values)));
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const timestamp = BigInt((await ethers.provider.getBlock("latest")).timestamp);
  const deadline = timestamp + 7200n;
  const minTimestamp = timestamp - 3600n, maxTimestamp = timestamp + 3600n;
  const checkpointX = BigInt(base.checkpointX), checkpointY = BigInt(base.checkpointY);
  const targetX = BigInt(base.targetX), targetY = BigInt(base.targetY);
  const maxDistanceSq = BigInt(base.maxDistanceSq);
  const fragmentPayload = BigInt(base.fragmentPayload), fragmentSalt = BigInt(base.fragmentSalt);
  const fragmentCommitment = hash([fragmentPayload, fragmentSalt]);
  const checkpointCommitment = hash([checkpointX, checkpointY, timestamp]);
  const zoneHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "uint32", "uint32", "uint32", "uint32"],
    [ethers.id("ECHO_V4_GEOGRAPHIC_ZONE_V1"), zone.minLat, zone.maxLat, zone.minLon, zone.maxLon]
  ));
  const v4Dir = "build/v4-geographic-bound";
  const v4Input = {
    checkpointLat: checkpointX.toString(), checkpointLon: checkpointY.toString(),
    checkpointTimestamp: timestamp.toString(), minLat: zone.minLat.toString(),
    maxLat: zone.maxLat.toString(), minLon: zone.minLon.toString(),
    maxLon: zone.maxLon.toString(), expectedCheckpointCommitment: checkpointCommitment.toString()
  };
  const v4 = await snarkjs.groth16.fullProve(
    v4Input, `${v4Dir}/EchoGeographicBoundV4_js/EchoGeographicBoundV4.wasm`,
    `${v4Dir}/setup/EchoGeographicBoundV4_final.zkey`
  );
  const v4Key = JSON.parse(fs.readFileSync(`${v4Dir}/setup/verification_key.json`, "utf8"));
  if (!await snarkjs.groth16.verify(v4Key, v4.publicSignals, v4.proof))
    throw new Error("V4 Groth16 proof failed local verification");
  if (BigInt(v4.publicSignals[4]) !== checkpointCommitment)
    throw new Error("V4 checkpoint commitment mismatch");
  const [v4A, v4B, v4C, v4Signals] = JSON.parse(
    `[${await snarkjs.groth16.exportSolidityCallData(v4.proof, v4.publicSignals)}]`
  );
  const calldataHash = BigInt(ethers.keccak256(data));
  const mask = (1n << 128n) - 1n;
  const authorizationHash1 = hash([
    BigInt(account), BigInt(delegatee), BigInt(validator.address), BigInt(target),
    BigInt(value), calldataHash & mask, calldataHash >> 128n, chainId, BigInt(nonce),
    deadline, fragmentCommitment, targetX, targetY, maxDistanceSq, minTimestamp, maxTimestamp
  ]);
  const authorizationCommitment = hash([authorizationHash1, checkpointCommitment]);
  const nullifier = hash([BigInt(account), authorizationCommitment]);
  const input = {
    expectedFragmentCommitment: fragmentCommitment,
    expectedCheckpointCommitment: checkpointCommitment,
    expectedCheckpointTimestamp: timestamp,
    expectedAuthorizationCommitment: authorizationCommitment,
    expectedNullifier: nullifier,
    account: BigInt(account), delegatee: BigInt(delegatee),
    validator: BigInt(validator.address), target: BigInt(target), value: BigInt(value),
    calldataHashLow: calldataHash & mask, calldataHashHigh: calldataHash >> 128n,
    chainId, nonce: BigInt(nonce), deadline, targetX, targetY, maxDistanceSq,
    minTimestamp, maxTimestamp, fragmentPayload, fragmentSalt,
    checkpointX, checkpointY, checkpointTimestamp: timestamp
  };
  const v3Dir = "build/v3-timestamp-fixed";
  const v3 = await snarkjs.groth16.fullProve(
    stringify(input), `${v3Dir}/EchoAuthorizationVerifierV3_js/EchoAuthorizationVerifierV3.wasm`,
    `${v3Dir}/EchoAuthorizationVerifierV3_final.zkey`
  );
  const v3Key = JSON.parse(fs.readFileSync(`${v3Dir}/verification_key.json`, "utf8"));
  if (!await snarkjs.groth16.verify(v3Key, v3.publicSignals, v3.proof))
    throw new Error("V3 Groth16 proof failed local verification");
  if (v3.publicSignals.length !== 20 || BigInt(v3.publicSignals[19]) !== timestamp)
    throw new Error("V3 public signal mismatch");
  const [v3A, v3B, v3C, v3Signals] = JSON.parse(
    `[${await snarkjs.groth16.exportSolidityCallData(v3.proof, v3.publicSignals)}]`
  );
  const checkpoint = {
    account, delegatee, zoneHash,
    checkpointCommitment: ethers.toBeHex(checkpointCommitment, 32),
    authorizationCommitment: ethers.toBeHex(authorizationCommitment, 32),
    timestamp, nonce: BigInt(nonce)
  };
  const signature = await validator.signTypedData(
    { name: "EchoAttestationRegistryV3", version: "1", chainId, verifyingContract: registry },
    TYPES, checkpoint
  );
  return {
    checkpoint, signature, v3A, v3B, v3C, v3Signals, v4A, v4B, v4C, v4Signals,
    nullifier, target, data, value
  };
}
module.exports = { proveAuthorizedCall, ZONE };
