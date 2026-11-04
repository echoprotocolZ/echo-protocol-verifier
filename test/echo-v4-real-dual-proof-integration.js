const { expect } = require("chai");
const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");

describe("ECHO V4 real dual-Groth16 authorization integration", function () {
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

    const geographicPolicy = await (
      await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")
    ).deploy();

    const geographicVerifier = await (
      await ethers.getContractFactory("EchoGeographicBoundVerifierV4")
    ).deploy();

    const geographicGateway = await (
      await ethers.getContractFactory("EchoGeographicProofGatewayV4")
    ).deploy(geographicVerifier.target, geographicPolicy.target);

    const dualVerifier = await (
      await ethers.getContractFactory("EchoDualProofVerifierV4")
    ).deploy(bridge.target, geographicGateway.target);

    const v4Bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV4")
    ).deploy(dualVerifier.target, registry.target);

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountV4")
    ).deploy(owner.address, ethers.ZeroAddress, v4Bridge.target);

    const target = await (
      await ethers.getContractFactory("TestTarget")
    ).deploy();

    async function admin(contract, method, args) {
      const data = contract.interface.encodeFunctionData(method, args);
      await (await account.executeAdministration(contract.target, data)).wait();
    }

    const zone = {
      minLat: 100000,
      maxLat: 101000,
      minLon: 199000,
      maxLon: 201000
    };

    const zoneHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint32", "uint32", "uint32", "uint32"],
        [
          ethers.id("ECHO_V4_GEOGRAPHIC_ZONE_V1"),
          zone.minLat,
          zone.maxLat,
          zone.minLon,
          zone.maxLon
        ]
      )
    );

    const geographicAdminData =
      geographicPolicy.interface.encodeFunctionData(
        "setGeographicPolicy",
        [owner.address, zone]
      );

    await (
      await account.executeGeographicAdministration(
        geographicAdminData
      )
    ).wait();

    await admin(registry, "setCheckpointBridge", [v4Bridge.target, true]);
    await admin(registry, "setValidatorSigner", [validator.address, true]);
    await admin(v4Bridge, "setAuthorizedDelegatee", [owner.address, true]);

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

    // Generate a genuine V4 geographic proof bound to
    // the exact same checkpoint commitment used by V3.
    const v4Input = {
      checkpointLat: checkpointX.toString(),
      checkpointLon: checkpointY.toString(),
      checkpointTimestamp: timestamp.toString(),
      minLat: zone.minLat.toString(),
      maxLat: zone.maxLat.toString(),
      minLon: zone.minLon.toString(),
      maxLon: zone.maxLon.toString(),
      expectedCheckpointCommitment: checkpointCommitment.toString()
    };

    const v4Dir = "build/v4-geographic-bound";

    const {
      proof: v4Proof,
      publicSignals: v4PublicSignals
    } = await snarkjs.groth16.fullProve(
      v4Input,
      `${v4Dir}/EchoGeographicBoundV4_js/EchoGeographicBoundV4.wasm`,
      `${v4Dir}/setup/EchoGeographicBoundV4_final.zkey`
    );

    const v4VerificationKey = JSON.parse(
      fs.readFileSync(
        `${v4Dir}/setup/verification_key.json`,
        "utf8"
      )
    );

    const v4ProofValid = await snarkjs.groth16.verify(
      v4VerificationKey,
      v4PublicSignals,
      v4Proof
    );

    expect(v4ProofValid).to.equal(true);
    expect(BigInt(v4PublicSignals[4])).to.equal(
      checkpointCommitment
    );

    const v4SolidityCalldata =
      await snarkjs.groth16.exportSolidityCallData(
        v4Proof,
        v4PublicSignals
      );

    const [v4A, v4B, v4C, v4Signals] = JSON.parse(
      `[${v4SolidityCalldata}]`
    );

    console.log("REAL V4 GEOGRAPHIC PROOF VERIFIED");
    console.log("V3/V4 checkpoint commitment matched");

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
      checkpoint, signature, a, b, c, signals, v4A, v4B, v4C, v4Signals,
      target.target, 0, data
    ];

    // Security regression: a delegated execution must not
    // modify geographic policy through the general execution path.
    const forbiddenPolicyData =
      geographicPolicy.interface.encodeFunctionData(
        "disableGeographicPolicy",
        [owner.address]
      );

    let geographicBypassError;
    try {
      await (
        await account.executeAuthorized(
          checkpoint, signature,
          a, b, c, signals,
          v4A, v4B, v4C, v4Signals,
          geographicPolicy.target, 0, forbiddenPolicyData
        )
      ).wait();
    } catch (error) {
      geographicBypassError = error;
    }

    expect(
      geographicBypassError,
      "Geographic policy bypass must revert"
    ).to.exist;

    const expectedGeographicError =
      account.interface.getError("InvalidAddress").selector;

    const geographicRevertData =
      geographicBypassError?.data ??
      geographicBypassError?.error?.data ??
      geographicBypassError?.info?.error?.data;

    expect(geographicRevertData).to.equal(expectedGeographicError);

    expect(await account.nonce()).to.equal(0n);
    expect(await v4Bridge.consumedNullifiers(nullifier)).to.equal(false);

    console.log("ATTACK REJECTED: Geographic policy administration bypass");


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
        a, b, c, signals, v4A, v4B, v4C, v4Signals, target.target, 0, data
      );
      await tx.wait();
    } catch (error) {
      mismatchRejected = true;
    }
    expect(mismatchRejected, "Timestamp mismatch must revert").to.equal(true);

    expect(await account.nonce()).to.equal(0n);


    async function expectAttackRejected(label, attackArgs) {
      let rejected = false;
      try {
        const tx = await account.executeAuthorized(...attackArgs);
        await tx.wait();
      } catch (error) {
        rejected = true;
      }

      expect(rejected, `${label} must revert`).to.equal(true);
      expect(await account.nonce()).to.equal(0n);
      expect(await v4Bridge.consumedNullifiers(nullifier)).to.equal(false);

      const originalDigest = await registry.checkpointDigest(checkpoint);
      expect(
        await registry.consumedCheckpoints(originalDigest)
      ).to.equal(false);

      expect(await target.storedValue()).to.equal(0n);
      console.log("ATTACK REJECTED:", label);
    }

    const alteredData = target.interface.encodeFunctionData(
      "setValue", [999]
    );

    await expectAttackRejected(
      "Altered transaction calldata",
      [...args.slice(0, -1), alteredData]
    );

    const alteredSignals = [...signals];
    alteredSignals[19] = (
      BigInt(alteredSignals[19]) + 60n
    ).toString();

    await expectAttackRejected(
      "Modified public timestamp signal",
      [checkpoint, signature, a, b, c, alteredSignals,
       target.target, 0, data]
    );

    const [, unauthorizedSigner] = await ethers.getSigners();
    const badSignature = await owner.signTypedData(
      domain, types, checkpoint
    );

    await expectAttackRejected(
      "Unauthorized validator signature",
      [checkpoint, badSignature, a, b, c, signals, v4A, v4B, v4C, v4Signals,
       target.target, 0, data]
    );

    const modifiedCheckpoint = {
      ...checkpoint,
      checkpointCommitment: ethers.id("TAMPERED_CHECKPOINT")
    };

    const modifiedSignature = await validator.signTypedData(
      domain, types, modifiedCheckpoint
    );

    await expectAttackRejected(
      "Modified checkpoint commitment",
      [modifiedCheckpoint, modifiedSignature, a, b, c, signals, v4A, v4B, v4C, v4Signals,
       target.target, 0, data]
    );


    // Attack 5: Substitute a different transaction target.
    const alternateTarget = await (
      await ethers.getContractFactory("TestTarget")
    ).deploy();

    await expectAttackRejected(
      "Substituted transaction target",
      [checkpoint, signature, a, b, c, signals, v4A, v4B, v4C, v4Signals,
       alternateTarget.target, 0, data]
    );

    expect(await alternateTarget.storedValue()).to.equal(0n);

    // Attack 6: Change the public nonce without a new proof.
    const tamperedNonceSignals = [...signals];
    tamperedNonceSignals[11] = "1";

    await expectAttackRejected(
      "Modified authorization nonce",
      [checkpoint, signature, a, b, c, tamperedNonceSignals,
       target.target, 0, data]
    );

    // Attack 7: Expire the authorization by advancing block time.
    // Use a snapshot so the legitimate proof remains valid afterward.
    const snapshot = await ethers.provider.send(
      "evm_snapshot", []
    );

    try {
      await ethers.provider.send("evm_setNextBlockTimestamp", [
        Number(deadline + 1n)
      ]);
      await ethers.provider.send("evm_mine", []);

      await expectAttackRejected(
        "Expired authorization",
        args
      );
    } finally {
      await ethers.provider.send("evm_revert", [snapshot]);
    }


    // Attack 8: Reuse Account A's proof against Account B.
    const secondAccount = await (
      await ethers.getContractFactory("EchoSmartAccountV4")
    ).deploy(
      owner.address,
      ethers.ZeroAddress,
      v4Bridge.target
    );

    let crossAccountRejected = false;

    try {
      const tx = await secondAccount.executeAuthorized(
        ...args
      );
      await tx.wait();
    } catch (error) {
      crossAccountRejected = true;
    }

    expect(
      crossAccountRejected,
      "Cross-account replay must revert"
    ).to.equal(true);

    expect(await account.nonce()).to.equal(0n);
    expect(await secondAccount.nonce()).to.equal(0n);
    expect(await v4Bridge.consumedNullifiers(nullifier)).to.equal(false);
    expect(await target.storedValue()).to.equal(0n);

    const replayDigest = await registry.checkpointDigest(checkpoint);
    expect(
      await registry.consumedCheckpoints(replayDigest)
    ).to.equal(false);

    console.log("ATTACK REJECTED: Cross-account replay");


    // Attack 9: Attempt authorization using a foreign chain ID.
    const foreignChainSignals = [...signals];
    foreignChainSignals[10] = "137";

    const foreignChainArgs = [
      checkpoint, signature, a, b, c,
      foreignChainSignals, v4A, v4B, v4C, v4Signals,
      target.target, 0, data
    ];

    let crossChainError;

    try {
      const tx = await account.executeAuthorized(
        ...foreignChainArgs
      );
      await tx.wait();
    } catch (error) {
      crossChainError = error;
    }

    expect(
      crossChainError,
      "Cross-chain replay must revert"
    ).to.exist;

    const invalidChainSelector =
      bridge.interface.getError("InvalidChain").selector;

    const revertData =
      crossChainError?.data ??
      crossChainError?.error?.data ??
      crossChainError?.info?.error?.data;

    expect(
      revertData,
      "Expected InvalidChain revert data"
    ).to.equal(invalidChainSelector);

    expect(await account.nonce()).to.equal(0n);
    expect(await v4Bridge.consumedNullifiers(nullifier)).to.equal(false);
    expect(await target.storedValue()).to.equal(0n);

    const chainReplayDigest =
      await registry.checkpointDigest(checkpoint);

    expect(
      await registry.consumedCheckpoints(chainReplayDigest)
    ).to.equal(false);

    console.log("ATTACK REJECTED: Cross-chain signal replay");

    // Attack 10: Reuse a checkpoint after its validator is revoked.
    await admin(
      registry,
      "setValidatorSigner",
      [validator.address, false]
    );

    expect(
      await registry.trustedValidatorSigners(
        account.target,
        validator.address
      )
    ).to.equal(false);

    // Confirm the exact registry error, not merely any revert.
    let revocationError;
    try {
      const tx = await account.executeAuthorized(...args);
      await tx.wait();
    } catch (error) {
      revocationError = error;
    }

    expect(revocationError, "Revocation must revert").to.exist;

    const expectedSelector = registry.interface.getError(
      "UntrustedCheckpointSigner"
    ).selector;

    const revocationRevertData =
      revocationError?.data ??
      revocationError?.error?.data ??
      revocationError?.info?.error?.data;

    expect(
      revocationRevertData,
      "Expected UntrustedCheckpointSigner error"
    ).to.equal(expectedSelector);

    expect(await account.nonce()).to.equal(0n);
    expect(await v4Bridge.consumedNullifiers(nullifier)).to.equal(false);
    expect(await target.storedValue()).to.equal(0n);

    const revokedDigest =
      await registry.checkpointDigest(checkpoint);

    expect(
      await registry.consumedCheckpoints(revokedDigest)
    ).to.equal(false);

    console.log(
      "ATTACK REJECTED: Revoked validator authorization"
    );

    // Restore validator trust for the legitimate execution.
    await admin(
      registry,
      "setValidatorSigner",
      [validator.address, true]
    );

    expect(
      await registry.trustedValidatorSigners(
        account.target,
        validator.address
      )
    ).to.equal(true);

    console.log("Validator restored for legitimate execution");

    await (await account.executeAuthorized(...args)).wait();

    expect(await target.storedValue()).to.equal(888n);
    expect(await account.nonce()).to.equal(1n);
    expect(await v4Bridge.consumedNullifiers(nullifier)).to.equal(true);

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
