const { expect } = require("chai");
const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");

describe("ECHO V3 real Groth16 authorization integration", function () {
  this.timeout(180000);

  it("executes a signed, timestamp-bound authorization and blocks replay", async function () {
    const [owner, validator] = await ethers.getSigners();

    const verifier = await (
      await ethers.getContractFactory("EchoAuthorizationVerifierV3")
    ).deploy();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();

    const bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV3")
    ).deploy(verifier.target, registry.target);

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountV3")
    ).deploy(owner.address, ethers.ZeroAddress, bridge.target);

    const target = await (
      await ethers.getContractFactory("TestTarget")
    ).deploy();

    async function admin(contract, method, args) {
      const data = contract.interface.encodeFunctionData(method, args);
      await (await account.executeAdministration(contract.target, data)).wait();
    }

    const zoneHash = ethers.id("ECHO_V3_REAL_PROOF_TEST_ZONE");

    await admin(registry, "setCheckpointBridge", [bridge.target, true]);
    await admin(registry, "setValidatorSigner", [validator.address, true]);
    await admin(bridge, "setAuthorizedDelegatee", [owner.address, true]);

    await admin(registry, "setAttestationPolicy", [
      owner.address,
      {
        allowedZoneHash: zoneHash,
        maxTimeDrift: 3600,
        requiredTier: 0,
        allowValidatorFallback: false,
        enabled: true
      }
    ]);

    const poseidon = await buildPoseidon();
    const hash = values => BigInt(
      poseidon.F.toString(poseidon(values))
    );

    const base = JSON.parse(
      fs.readFileSync("build/v3-bound/input-local.json", "utf8")
    );

    const network = await ethers.provider.getNetwork();
    const timestamp = BigInt(
      (await ethers.provider.getBlock("latest")).timestamp
    );

    const nonce = 0n;
    const deadline = timestamp + 7200n;
    const minTimestamp = timestamp - 3600n;
    const maxTimestamp = timestamp + 3600n;

    const data = target.interface.encodeFunctionData("setValue", [888]);
    const calldataHash = BigInt(ethers.keccak256(data));
    const mask = (1n << 128n) - 1n;

    const fragmentPayload = BigInt(base.fragmentPayload);
    const fragmentSalt = BigInt(base.fragmentSalt);
    const checkpointX = BigInt(base.checkpointX);
    const checkpointY = BigInt(base.checkpointY);
    const targetX = BigInt(base.targetX);
    const targetY = BigInt(base.targetY);
    const maxDistanceSq = BigInt(base.maxDistanceSq);

    const fragmentCommitment = hash([fragmentPayload, fragmentSalt]);
    const checkpointCommitment = hash([
      checkpointX, checkpointY, timestamp
    ]);

    const authorizationHash1 = hash([
      BigInt(account.target),
      BigInt(owner.address),
      BigInt(validator.address),
      BigInt(target.target),
      0n,
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
      authorizationHash1, checkpointCommitment
    ]);

    const nullifier = hash([
      BigInt(account.target), authorizationCommitment
    ]);

    const input = {
      expectedFragmentCommitment: fragmentCommitment,
      expectedCheckpointCommitment: checkpointCommitment,
      expectedCheckpointTimestamp: timestamp,
      expectedAuthorizationCommitment: authorizationCommitment,
      expectedNullifier: nullifier,
      account: BigInt(account.target),
      delegatee: BigInt(owner.address),
      validator: BigInt(validator.address),
      target: BigInt(target.target),
      value: 0n,
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

    const stringify = obj => JSON.parse(JSON.stringify(
      obj, (_, v) => typeof v === "bigint" ? v.toString() : v
    ));

    const dir = "build/v3-timestamp-fixed";

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      stringify(input),
      `${dir}/EchoAuthorizationVerifierV3_js/EchoAuthorizationVerifierV3.wasm`,
      `${dir}/EchoAuthorizationVerifierV3_final.zkey`
    );

    const vkey = JSON.parse(
      fs.readFileSync(`${dir}/verification_key.json`, "utf8")
    );

    expect(await snarkjs.groth16.verify(
      vkey, publicSignals, proof
    )).to.equal(true);

    expect(publicSignals.length).to.equal(20);
    expect(BigInt(publicSignals[19])).to.equal(timestamp);

    const checkpoint = {
      account: account.target,
      delegatee: owner.address,
      zoneHash,
      checkpointCommitment: ethers.toBeHex(checkpointCommitment, 32),
      authorizationCommitment: ethers.toBeHex(authorizationCommitment, 32),
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
      domain, types, checkpoint
    );

    const calldata = await snarkjs.groth16.exportSolidityCallData(
      proof, publicSignals
    );

    const [a, b, c, signals] = JSON.parse(`[${calldata}]`);

    const args = [
      checkpoint, signature, a, b, c, signals,
      target.target, 0, data
    ];

    const changedCheckpoint = {
      ...checkpoint,
      timestamp: timestamp - 60n
    };

    const changedSignature = await validator.signTypedData(
      domain, types, changedCheckpoint
    );

    let mismatchRejected = false;
    try {
      const tx = await account.executeAuthorized(
        changedCheckpoint, changedSignature,
        a, b, c, signals, target.target, 0, data
      );
      await tx.wait();
    } catch (error) {
      mismatchRejected = true;
    }
    expect(mismatchRejected, "Timestamp mismatch must revert").to.equal(true);

    expect(await account.nonce()).to.equal(0n);

    await (await account.executeAuthorized(...args)).wait();

    expect(await target.storedValue()).to.equal(888n);
    expect(await account.nonce()).to.equal(1n);
    expect(await bridge.consumedNullifiers(nullifier)).to.equal(true);

    const digest = await registry.checkpointDigest(checkpoint);
    expect(await registry.consumedCheckpoints(digest)).to.equal(true);

    let replayRejected = false;
    try {
      const tx = await account.executeAuthorized(...args);
      await tx.wait();
    } catch (error) {
      replayRejected = true;
    }
    expect(replayRejected, "Replay must revert").to.equal(true);

    console.log("REAL GROTH16 AUTHORIZATION VERIFIED");
    console.log("Timestamp mismatch rejected");
    console.log("Authorized target execution succeeded");
    console.log("Checkpoint and nullifier consumed");
    console.log("Replay rejected");
  });
});
