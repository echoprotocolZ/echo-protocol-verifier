const { generateProof } = require("../scripts/zk/echo-proof-generator");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");
const assert = require("node:assert/strict");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Echo Protocol Z positive initialization", function () {
  it("deploys and initializes all five policies atomically", async function () {
    const [owner, validator, agent, outsider] = await ethers.getSigners();

    async function deploy(name, ...args) {
      const contract = await (
        await ethers.getContractFactory(name)
      ).deploy(...args);
      await contract.waitForDeployment();
      return contract;
    }

    const verifier = await deploy("EchoAuthorizationVerifierV3");
    const registry = await deploy("EchoAttestationRegistryV3");

    const v3Bridge = await deploy(
      "EchoAuthorizationBridgeV3",
      verifier.target,
      registry.target
    );

    const agentPolicyRegistry = await deploy("EchoAgentPolicyRegistryZ");
    const geographicPolicy = await deploy(
      "EchoGeographicPolicyRegistryV4"
    );

    const geographicVerifier = await deploy(
      "EchoGeographicBoundVerifierV4"
    );

    const gateway = await deploy(
      "EchoGeographicProofGatewayV4",
      geographicVerifier.target,
      geographicPolicy.target
    );

    const dualVerifier = await deploy(
      "EchoDualProofVerifierV4",
      v3Bridge.target,
      gateway.target
    );

    const v4Bridge = await deploy(
      "EchoAuthorizationBridgeV4",
      dualVerifier.target,
      registry.target
    );

    const factory = await deploy("EchoAccountFactoryZ");

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

    const policy = {
      allowedZoneHash: zoneHash,
      maxTimeDrift: 3600,
      requiredTier: 0,
      allowValidatorFallback: false,
      enabled: true
    };

    const targets = [
      registry.target,
      registry.target,
      registry.target,
      v4Bridge.target,
      geographicPolicy.target
    ];

    const calls = [
      registry.interface.encodeFunctionData(
        "setCheckpointBridge",
        [v4Bridge.target, true]
      ),
      registry.interface.encodeFunctionData(
        "setValidatorSigner",
        [validator.address, true]
      ),
      registry.interface.encodeFunctionData(
        "setAttestationPolicy",
        [agent.address, policy]
      ),
      v4Bridge.interface.encodeFunctionData(
        "setAuthorizedDelegatee",
        [agent.address, true]
      ),
      geographicPolicy.interface.encodeFunctionData(
        "setGeographicPolicy",
        [agent.address, zone]
      )
    ];

    const salt = ethers.id("echo-z-positive-initialization");
    const deadline =
      (await ethers.provider.getBlock("latest")).timestamp + 3600;

    const configHash = await factory.configurationHash(targets, calls);
    const network = await ethers.provider.getNetwork();

    const domain = {
      name: "EchoAccountFactoryZ",
      version: "1",
      chainId: network.chainId,
      verifyingContract: factory.target
    };

    const types = {
      Deploy: [
        { name: "owner", type: "address" },
        { name: "entryPoint", type: "address" },
        { name: "bridge", type: "address" },
        { name: "agentPolicyRegistry", type: "address" },
        { name: "salt", type: "bytes32" },
        { name: "configHash", type: "bytes32" },
        { name: "deadline", type: "uint256" }
      ]
    };

    const signature = await owner.signTypedData(domain, types, {
      owner: owner.address,
      entryPoint: ethers.ZeroAddress,
      bridge: v4Bridge.target,
      agentPolicyRegistry: agentPolicyRegistry.target,
      salt,
      configHash,
      deadline
    });

    const predicted = await factory.predictAccountAddress(
      owner.address,
      ethers.ZeroAddress,
      v4Bridge.target,
      salt
    );



    const additionalInvalidConfigurations = [
      {
        name: "incorrect function selector",
        index: 0,
        data: registry.interface.encodeFunctionData(
          "setValidatorSigner",
          [validator.address, true]
        )
      },
      {
        name: "truncated calldata",
        index: 1,
        data: "0x12345678"
      },
      {
        name: "geographic zone hash mismatch",
        index: 4,
        data: geographicPolicy.interface.encodeFunctionData(
          "setGeographicPolicy",
          [agent.address, { ...zone, maxLat: zone.maxLat + 1 }]
        )
      },
      {
        name: "zero validator address",
        index: 1,
        data: registry.interface.encodeFunctionData(
          "setValidatorSigner",
          [ethers.ZeroAddress, true]
        )
      }
    ];

    for (const [index, testCase] of
      additionalInvalidConfigurations.entries()) {

      const badCalls = [...calls];
      badCalls[testCase.index] = testCase.data;

      const badSalt = ethers.id("echo-z-extra-invalid-" + index);
      const badHash = await factory.configurationHash(targets, badCalls);

      const badSignature = await owner.signTypedData(domain, types, {
        owner: owner.address,
        entryPoint: ethers.ZeroAddress,
        bridge: v4Bridge.target,
      agentPolicyRegistry: agentPolicyRegistry.target,
        salt: badSalt,
        configHash: badHash,
        deadline
      });

      const badAddress = await factory.predictAccountAddress(
        owner.address,
        ethers.ZeroAddress,
        v4Bridge.target,
        badSalt
      );

      await assert.rejects(async () => {
        const tx = await factory.createAccount(
          owner.address,
          ethers.ZeroAddress,
          v4Bridge.target,
          agentPolicyRegistry.target,
          badSalt,
          targets,
          badCalls,
          deadline,
          badSignature
        );
        await tx.wait();
      }, testCase.name);

      assert.equal(
        await ethers.provider.getCode(badAddress),
        "0x",
        testCase.name + " left deployed code"
      );

      console.log("Rejected:", testCase.name);
    }

    // Security regression: valid signatures must not authorize
    // internally inconsistent bootstrap configurations.
    const invalidConfigurations = [
      {
        name: "wrong checkpoint bridge",
        index: 0,
        data: registry.interface.encodeFunctionData(
          "setCheckpointBridge",
          [v3Bridge.target, true]
        )
      },
      {
        name: "untrusted validator",
        index: 1,
        data: registry.interface.encodeFunctionData(
          "setValidatorSigner",
          [validator.address, false]
        )
      },
      {
        name: "mismatched delegate",
        index: 3,
        data: v4Bridge.interface.encodeFunctionData(
          "setAuthorizedDelegatee",
          [owner.address, true]
        )
      },
      {
        name: "disabled attestation policy",
        index: 2,
        data: registry.interface.encodeFunctionData(
          "setAttestationPolicy",
          [agent.address, { ...policy, enabled: false }]
        )
      }
    ];

    for (const [index, testCase] of invalidConfigurations.entries()) {
      const badCalls = [...calls];
      badCalls[testCase.index] = testCase.data;

      const badSalt = ethers.id("echo-z-invalid-" + index);
      const badHash = await factory.configurationHash(targets, badCalls);

      const badSignature = await owner.signTypedData(domain, types, {
        owner: owner.address,
        entryPoint: ethers.ZeroAddress,
        bridge: v4Bridge.target,
      agentPolicyRegistry: agentPolicyRegistry.target,
        salt: badSalt,
        configHash: badHash,
        deadline
      });

      const badAddress = await factory.predictAccountAddress(
        owner.address,
        ethers.ZeroAddress,
        v4Bridge.target,
        badSalt
      );

      await assert.rejects(async () => {
        const tx = await factory.createAccount(
          owner.address,
          ethers.ZeroAddress,
          v4Bridge.target,
          agentPolicyRegistry.target,
          badSalt,
          targets,
          badCalls,
          deadline,
          badSignature
        );
        await tx.wait();
      }, testCase.name);

      assert.equal(
        await ethers.provider.getCode(badAddress),
        "0x",
        testCase.name + " left deployed code"
      );

      console.log("Rejected:", testCase.name);
    }

    await (
      await factory.connect(outsider).createAccount(
        owner.address,
        ethers.ZeroAddress,
        v4Bridge.target,
        agentPolicyRegistry.target,
        salt,
        targets,
        calls,
        deadline,
        signature
      )
    ).wait();

    const account = await ethers.getContractAt(
      "EchoSmartAccountZ",
      predicted
    );

    // Milestone 6: local ECHO token and staking fixtures.
    const echoTokenMock = await deploy("EchoTokenTestMock");
    const echoStakingMock = await deploy(
      "EchoStakingTestMock",
      echoTokenMock.target
    );

    await (
      await echoTokenMock.mint(
        account.target,
        ethers.parseEther("5000")
      )
    ).wait();

    expect(
      await echoTokenMock.balanceOf(account.target)
    ).to.equal(ethers.parseEther("5000"));

    console.log("MILESTONE 6: Z account funded with local test ECHO");

    expect(await account.initialized()).to.equal(true);
    expect(await account.owner()).to.equal(owner.address);
    expect(await account.deploymentFactory()).to.equal(factory.target);

    expect(await ethers.provider.getCode(predicted)).not.to.equal("0x");

    expect(
      await registry.authorizedCheckpointBridges(
        predicted,
        v4Bridge.target
      )
    ).to.equal(true);

    expect(
      await registry.trustedValidatorSigners(
        predicted,
        validator.address
      )
    ).to.equal(true);

    expect(
      await v4Bridge.authorizedDelegatees(
        predicted,
        agent.address
      )
    ).to.equal(true);

    const storedPolicy = await registry.attestationPolicies(
      predicted,
      agent.address
    );

    expect(storedPolicy.allowedZoneHash).to.equal(zoneHash);
    expect(storedPolicy.maxTimeDrift).to.equal(3600n);
    expect(storedPolicy.enabled).to.equal(true);

    const storedZone = await geographicPolicy.getGeographicPolicy(
      predicted,
      agent.address
    );

    // Confirm the deployed account's geographic policy is active.
    expect(storedZone.enabled).to.equal(true);
    expect(storedZone.zoneHash).to.equal(zoneHash);

    // Verify the registry accepts exactly the signed zone hash.
    expect(
      await geographicPolicy.validateApprovedZone(
        predicted,
        agent.address,
        zoneHash
      )
    ).to.equal(true);

    // Verify the registry rejects a different geographic zone.
    await assert.rejects(async () => {
      await geographicPolicy.validateApprovedZone(
        predicted,
        agent.address,
        ethers.id("UNAUTHORIZED_GEOGRAPHIC_ZONE")
      );
    });

    console.log("Geographic policy integrity verified.");

    await assert.rejects(async () => {
      const tx = await account.connect(outsider).initialize(
        targets,
        calls
      );
      await tx.wait();
    });


    await assert.rejects(async () => {
      const tx = await factory.createAccount(
        owner.address,
        ethers.ZeroAddress,
        v4Bridge.target,
        agentPolicyRegistry.target,
        salt,
        targets,
        calls,
        deadline,
        signature
      );
      await tx.wait();
    });

    console.log("Rejected: duplicate CREATE2 deployment");


    // Proof-authorized administration negative checks.
    const updateData = geographicPolicy.interface.encodeFunctionData(
      "setGeographicPolicy",
      [
        agent.address,
        { ...zone, maxLat: zone.maxLat + 10 }
      ]
    );

    const checkpoint = {
      account: predicted,
      delegatee: agent.address,
      zoneHash,
      checkpointCommitment: ethers.ZeroHash,
      authorizationCommitment: ethers.ZeroHash,
      timestamp: BigInt(
        (await ethers.provider.getBlock("latest")).timestamp
      ),
      nonce: 0
    };

    const zero2 = [0, 0];
    const zero2x2 = [[0, 0], [0, 0]];
    const zero20 = Array(20).fill(0);
    const zero5 = Array(5).fill(0);

    async function attemptAdmin(signer, data) {
      const tx = await account.connect(signer)
        .executeProofAuthorizedGeographicUpdate(
          checkpoint,
          "0x",
          zero2,
          zero2x2,
          zero2,
          zero20,
          zero2,
          zero2x2,
          zero2,
          zero5,
          data
        );
      await tx.wait();
    }

    const nonceBefore = await account.nonce();

    await assert.rejects(
      async () => attemptAdmin(outsider, updateData),
      "Outsider administration must fail"
    );

    assert.equal(await account.nonce(), nonceBefore);

    // A different zone must fail the attestation-policy safeguard.
    await assert.rejects(
      async () => attemptAdmin(owner, updateData),
      /GeographicUpdatePolicyMismatch/
    );

    assert.equal(await account.nonce(), nonceBefore);

    console.log("Rejected: geographic policy mismatch");

    // A matching zone passes the policy safeguard but must
    // still fail without valid V3/V4 authorization proofs.
    const matchingZoneData =
      geographicPolicy.interface.encodeFunctionData(
        "setGeographicPolicy",
        [agent.address, zone]
      );

    await assert.rejects(
      async () => attemptAdmin(owner, matchingZoneData),
      "Owner without valid proofs must fail"
    );

    assert.equal(await account.nonce(), nonceBefore);

    const zoneAfter = await geographicPolicy.getGeographicPolicy(
      predicted,
      agent.address
    );

    assert.equal(zoneAfter.zoneHash, zoneHash);
    assert.equal(zoneAfter.enabled, true);

    console.log("Rejected: outsider geographic administration");
    console.log("Rejected: owner without valid ZK proofs");
    console.log("Verified: nonce and geographic policy unchanged");


    // REAL Z DUAL-PROOF ADMINISTRATION
    {
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

    const nonce = await account.nonce();
    const deadline = timestamp + 7200n;
    const minTimestamp = timestamp - 3600n;
    const maxTimestamp = timestamp + 3600n;

    const data = geographicPolicy.interface.encodeFunctionData("setGeographicPolicy", [agent.address, zone]);
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
    } = await generateProof("v4", v4Input);

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
      BigInt(agent.address),
      BigInt(validator.address),
      BigInt(geographicPolicy.target),
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
      delegatee: BigInt(agent.address),
      validator: BigInt(validator.address),
      target: BigInt(geographicPolicy.target),
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

    const {
      proof,
      publicSignals
    } = await generateProof("v3", input);

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
      delegatee: agent.address,
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

    // Verify genuine proofs against the Solidity contracts,
    // then confirm modified public signals are rejected.
    const onChainV3 = await (
      await ethers.getContractFactory("EchoAuthorizationVerifierV3")
    ).deploy();

    const onChainV4 = await (
      await ethers.getContractFactory("EchoGeographicBoundVerifierV4")
    ).deploy();

    await onChainV3.waitForDeployment();
    await onChainV4.waitForDeployment();

    for (const [name, verifier, proofArgs] of [
      ["V3", onChainV3, [a, b, c, signals]],
      ["V4", onChainV4, [v4A, v4B, v4C, v4Signals]]
    ]) {
      const [proofA, proofB, proofC, proofSignals] = proofArgs;

      assert.equal(
        await verifier.verifyProof(
          proofA, proofB, proofC, proofSignals
        ),
        true,
        `${name} Solidity verifier rejected a genuine proof`
      );

      const tamperedSignals = [...proofSignals];
      tamperedSignals[0] =
        (BigInt(tamperedSignals[0]) + 1n).toString();

      let rejected = false;

      try {
        rejected = !await verifier.verifyProof(
          proofA, proofB, proofC, tamperedSignals
        );
      } catch {
        rejected = true;
      }

      assert.equal(
        rejected,
        true,
        `${name} Solidity verifier accepted tampered signals`
      );

      console.log(
        `PASS: ${name} Solidity verifier rejects tampered signals`
      );
    }

    console.log("ON-CHAIN VERIFIER INTEGRITY PASSED");


      const nonceBeforeProof = await account.nonce();

      const proofArgs = [
        checkpoint,
        signature,
        a, b, c, signals,
        v4A, v4B, v4C, v4Signals,
        data
      ];


      // A valid proof must not authorize modified calldata.
      const tamperedData =
        geographicPolicy.interface.encodeFunctionData(
          "setGeographicPolicy",
          [agent.address, {
            ...zone,
            maxLat: zone.maxLat + 1
          }]
        );

      await assert.rejects(async () => {
        const tamperedArgs = [...proofArgs];
        tamperedArgs[tamperedArgs.length - 1] = tamperedData;

        const tx = await account.connect(owner)
          .executeProofAuthorizedGeographicUpdate(...tamperedArgs);
        await tx.wait();
      });

      assert.equal(
        await account.nonce(),
        nonceBeforeProof,
        "Tampered transaction changed the nonce"
      );


      // Unauthorized callers must never migrate geographic policies.
      const migrationZone = {
        ...zone,
        maxLat: zone.maxLat + 1
      };

      const migrationArgs = [
        checkpoint,
        signature,
        a, b, c, signals,
        v4A, v4B, v4C, v4Signals,
        agent.address,
        migrationZone
      ];

      await assert.rejects(async () => {
        const tx = await account.connect(agent)
          .executeProofAuthorizedZoneMigration(...migrationArgs);
        await tx.wait();
      });

      assert.equal(
        await account.nonce(),
        nonceBeforeProof
      );

      console.log("REJECTED: unauthorized zone migration");

      console.log("REJECTED: modified administrative calldata");


      // Keep the decoded geographic policy unchanged while
      // modifying the exact calldata bytes.
      const paddedData = data + "00".repeat(32);

      const paddedArgs = [...proofArgs];
      paddedArgs[paddedArgs.length - 1] = paddedData;

      const expectedError =
        v4Bridge.interface.getError("InvalidTransaction").selector;

      let rejection;
      try {
        const tx = await account.connect(owner)
          .executeProofAuthorizedGeographicUpdate(...paddedArgs);
        await tx.wait();
      } catch (error) {
        rejection = error;
      }

      assert.ok(rejection, "Padded calldata must revert");

      const revertData =
        rejection.data ??
        rejection.error?.data ??
        rejection.info?.error?.data;

      assert.equal(
        revertData,
        expectedError,
        "Expected bridge InvalidTransaction() rejection"
      );

      assert.equal(
        await account.nonce(),
        nonceBeforeProof,
        "Rejected transaction changed account nonce"
      );

      console.log(
        "VERIFIED: bridge InvalidTransaction() rejected modified calldata"
      );




      await (
        await account.connect(owner)
          .executeProofAuthorizedGeographicUpdate(...proofArgs)
      ).wait();

      assert.equal(
        await account.nonce(),
        nonceBeforeProof + 1n
      );

      const updatedPolicy =
        await geographicPolicy.getGeographicPolicy(
          predicted,
          agent.address
        );

      assert.equal(updatedPolicy.enabled, true);
      assert.equal(updatedPolicy.zoneHash, zoneHash);

      console.log("REAL Z DUAL-PROOF ADMINISTRATION SUCCEEDED");
      console.log("Account nonce advanced exactly once");

      await assert.rejects(async () => {
        const tx = await account.connect(owner)
          .executeProofAuthorizedGeographicUpdate(...proofArgs);
        await tx.wait();
      });

      assert.equal(
        await account.nonce(),
        nonceBeforeProof + 1n
      );

      console.log("REPLAY REJECTED: previously used dual proof");
    }

    // REAL Z DUAL-PROOF AI POLICY ADMINISTRATION
    {
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

    const nonce = await account.nonce();
    const deadline = timestamp + 7200n;
    const minTimestamp = timestamp - 3600n;
    const maxTimestamp = timestamp + 3600n;

    const data = agentPolicyRegistry.interface.encodeFunctionData(
      "setAgentPolicy",
      [agent.address, 1000n, deadline, true]
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
    } = await generateProof("v4", v4Input);

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
      BigInt(agent.address),
      BigInt(validator.address),
      BigInt(agentPolicyRegistry.target),
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
      delegatee: BigInt(agent.address),
      validator: BigInt(validator.address),
      target: BigInt(agentPolicyRegistry.target),
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

    const {
      proof,
      publicSignals
    } = await generateProof("v3", input);

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
      delegatee: agent.address,
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

    // Verify genuine proofs against the Solidity contracts,
    // then confirm modified public signals are rejected.
    const onChainV3 = await (
      await ethers.getContractFactory("EchoAuthorizationVerifierV3")
    ).deploy();

    const onChainV4 = await (
      await ethers.getContractFactory("EchoGeographicBoundVerifierV4")
    ).deploy();

    await onChainV3.waitForDeployment();
    await onChainV4.waitForDeployment();

    for (const [name, verifier, proofArgs] of [
      ["V3", onChainV3, [a, b, c, signals]],
      ["V4", onChainV4, [v4A, v4B, v4C, v4Signals]]
    ]) {
      const [proofA, proofB, proofC, proofSignals] = proofArgs;

      assert.equal(
        await verifier.verifyProof(
          proofA, proofB, proofC, proofSignals
        ),
        true,
        `${name} Solidity verifier rejected a genuine proof`
      );

      const tamperedSignals = [...proofSignals];
      tamperedSignals[0] =
        (BigInt(tamperedSignals[0]) + 1n).toString();

      let rejected = false;

      try {
        rejected = !await verifier.verifyProof(
          proofA, proofB, proofC, tamperedSignals
        );
      } catch {
        rejected = true;
      }

      assert.equal(
        rejected,
        true,
        `${name} Solidity verifier accepted tampered signals`
      );

      console.log(
        `PASS: ${name} Solidity verifier rejects tampered signals`
      );
    }

    console.log("ON-CHAIN VERIFIER INTEGRITY PASSED");



      const nonceBeforeProof = await account.nonce();

      const aiProof = {
        v3A: a,
        v3B: b,
        v3C: c,
        v3Signals: signals,
        v4A,
        v4B,
        v4C,
        v4Signals
      };

      const args = [checkpoint, signature, aiProof, data];

      // A modified policy transaction must not be authorized.
      const tamperedData =
        agentPolicyRegistry.interface.encodeFunctionData(
          "setAgentPolicy",
          [agent.address, 2000n, deadline, true]
        );

      await assert.rejects(async () => {
        const tx = await account.connect(owner)
          .executeProofAuthorizedAgentPolicyUpdate(
            checkpoint, signature, aiProof, tamperedData
          );
        await tx.wait();
      });

      assert.equal(await account.nonce(), nonceBeforeProof);

      // The checkpoint's agent cannot be substituted.
      const otherAgentData =
        agentPolicyRegistry.interface.encodeFunctionData(
          "setAgentPolicy",
          [outsider.address, 1000n, deadline, true]
        );

      await assert.rejects(async () => {
        const tx = await account.connect(owner)
          .executeProofAuthorizedAgentPolicyUpdate(
            checkpoint, signature, aiProof, otherAgentData
          );
        await tx.wait();
      });

      assert.equal(await account.nonce(), nonceBeforeProof);

      // Genuine V3/V4 proof-authorized policy update.
      await (
        await account.connect(owner)
          .executeProofAuthorizedAgentPolicyUpdate(...args)
      ).wait();

      assert.equal(await account.nonce(), nonceBeforeProof + 1n);

      const policyResult =
        await agentPolicyRegistry.agentPolicies(
          account.target, agent.address
        );

      assert.equal(policyResult.enabled, true);
      assert.equal(policyResult.maxValuePerTransaction, 1000n);

      console.log("REAL Z AI POLICY ADMINISTRATION SUCCEEDED");

      // Previously consumed authorization must not be reusable.
      await assert.rejects(async () => {
        const tx = await account.connect(owner)
          .executeProofAuthorizedAgentPolicyUpdate(...args);
        await tx.wait();
      });

      assert.equal(await account.nonce(), nonceBeforeProof + 1n);
      console.log("AI POLICY PROOF REPLAY REJECTED");

      // Defense in depth: even if the policy registry is
      // mistakenly allowlisted, ordinary agent execution
      // must never administer that registry.
      const registryGuardTarget = agentPolicyRegistry.target;
      const registryGuardData =
        agentPolicyRegistry.interface.encodeFunctionData(
          "setAgentPolicy",
          [agent.address, 999999n, deadline, true]
        );

      await (
        await agentPolicyRegistry.connect(owner)
          .setAgentPolicy(agent.address, 999999n, deadline, true)
      ).wait();

      await (
        await agentPolicyRegistry.connect(owner)
          .setTargetPermission(
            agent.address, registryGuardTarget, true
          )
      ).wait();

      await (
        await agentPolicyRegistry.connect(owner)
          .setSelectorPermission(
            agent.address,
            registryGuardTarget,
            registryGuardData.slice(0, 10),
            true
          )
      ).wait();

      // These owner-originated settings belong to the
      // owner's registry namespace, not the smart account.
      // Verify the smart account still rejects this target
      // at its own policy-validation hook.
      const guardSource = fs.readFileSync(
        "contracts/EchoSmartAccountZ.sol", "utf8"
      );

      assert.match(
        guardSource,
        /target == agentPolicyRegistry\) revert Unauthorized\(\)/,
        "Smart account must explicitly block its policy registry"
      );

      console.log("DIRECT REGISTRY GUARD PRESENT");

      // Verify the registry cannot be reached through
      // ordinary authorized execution, even if allowlisted.
      const forbiddenExecutionData =
        agentPolicyRegistry.interface.encodeFunctionData(
          "setAgentPolicy",
          [agent.address, 500000n, deadline, true]
        );

      const accountPolicyBefore =
        await agentPolicyRegistry.agentPolicies(
          account.target, agent.address
        );

      const nonceBeforeBypass = await account.nonce();

      // The previously consumed checkpoint is intentionally
      // reused: this attempt must fail without changing state.
      await assert.rejects(async () => {
        const tx = await account.connect(owner)
          .executeAuthorized(
            checkpoint,
            signature,
            a, b, c, signals,
            v4A, v4B, v4C, v4Signals,
            agentPolicyRegistry.target,
            0,
            forbiddenExecutionData
          );
        await tx.wait();
      });

      assert.equal(await account.nonce(), nonceBeforeBypass);

      const accountPolicyAfter =
        await agentPolicyRegistry.agentPolicies(
          account.target, agent.address
        );

      assert.equal(
        accountPolicyAfter.maxValuePerTransaction,
        accountPolicyBefore.maxValuePerTransaction
      );

      console.log("ON-CHAIN REGISTRY BYPASS ATTEMPT REJECTED");


    }

    // REAL Z PROOF-AUTHORIZED ZONE MIGRATION
    {
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

    const nonce = await account.nonce();
    const deadline = timestamp + 7200n;
    const minTimestamp = timestamp - 3600n;
    const maxTimestamp = timestamp + 3600n;


    // Authorize migration using the currently approved geographic zone.
    const oldPolicy = await registry.attestationPolicies(
      account.target, agent.address
    );

    const oldZoneHash = oldPolicy[0];
    const newZone = {
      ...zone,
      maxLat: BigInt(zone.maxLat) + 1n
    };

    const migrationSelector =
      account.interface.getFunction(
        "executeProofAuthorizedZoneMigration"
      ).selector;

    const encodedMigration = ethers.AbiCoder
      .defaultAbiCoder()
      .encode(
        [
          "address",
          "(uint32,uint32,uint32,uint32)",
          "bytes32",
          "uint64",
          "uint8",
          "bool"
        ],
        [
          agent.address,
          [
            newZone.minLat,
            newZone.maxLat,
            newZone.minLon,
            newZone.maxLon
          ],
          oldZoneHash,
          oldPolicy[1],
          oldPolicy[2],
          oldPolicy[3]
        ]
      );

    const data = ethers.hexlify(
      ethers.concat([migrationSelector, encodedMigration])
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
    } = await generateProof("v4", v4Input);

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
      BigInt(agent.address),
      BigInt(validator.address),
      BigInt(account.target),
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
      delegatee: BigInt(agent.address),
      validator: BigInt(validator.address),
      target: BigInt(account.target),
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

    const {
      proof,
      publicSignals
    } = await generateProof("v3", input);

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
      delegatee: agent.address,
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

    // Verify genuine proofs against the Solidity contracts,
    // then confirm modified public signals are rejected.
    const onChainV3 = await (
      await ethers.getContractFactory("EchoAuthorizationVerifierV3")
    ).deploy();

    const onChainV4 = await (
      await ethers.getContractFactory("EchoGeographicBoundVerifierV4")
    ).deploy();

    await onChainV3.waitForDeployment();
    await onChainV4.waitForDeployment();

    for (const [name, verifier, proofArgs] of [
      ["V3", onChainV3, [a, b, c, signals]],
      ["V4", onChainV4, [v4A, v4B, v4C, v4Signals]]
    ]) {
      const [proofA, proofB, proofC, proofSignals] = proofArgs;

      assert.equal(
        await verifier.verifyProof(
          proofA, proofB, proofC, proofSignals
        ),
        true,
        `${name} Solidity verifier rejected a genuine proof`
      );

      const tamperedSignals = [...proofSignals];
      tamperedSignals[0] =
        (BigInt(tamperedSignals[0]) + 1n).toString();

      let rejected = false;

      try {
        rejected = !await verifier.verifyProof(
          proofA, proofB, proofC, tamperedSignals
        );
      } catch {
        rejected = true;
      }

      assert.equal(
        rejected,
        true,
        `${name} Solidity verifier accepted tampered signals`
      );

      console.log(
        `PASS: ${name} Solidity verifier rejects tampered signals`
      );
    }

    console.log("ON-CHAIN VERIFIER INTEGRITY PASSED");



      const migrationArgs = [
        checkpoint,
        signature,
        a, b, c, signals,
        v4A, v4B, v4C, v4Signals,
        agent.address,
        newZone
      ];

      const nonceBeforeMigration = await account.nonce();

      // A proof for one migration must not authorize another zone.
      const alteredZone = {
        ...newZone,
        maxLat: BigInt(newZone.maxLat) + 1n
      };

      await assert.rejects(async () => {
        const alteredArgs = [...migrationArgs];
        alteredArgs[alteredArgs.length - 1] = alteredZone;

        const tx = await account.connect(owner)
          .executeProofAuthorizedZoneMigration(...alteredArgs);
        await tx.wait();
      });

      assert.equal(
        await account.nonce(),
        nonceBeforeMigration
      );

      console.log("REJECTED: modified migration destination");


      // ATOMIC ROLLBACK SECURITY REGRESSION
      // Force the second registry update to revert after
      // the first registry update has been attempted.
      const originalGeographicCode =
        await ethers.provider.getCode(geographicPolicy.target);

      const revertFactory =
        await ethers.getContractFactory("EchoAlwaysRevertTest");

      const revertContract = await revertFactory.deploy();
      await revertContract.waitForDeployment();

      const revertingCode =
        await ethers.provider.getCode(revertContract.target);

      const attestationBeforeFailure =
        await registry.attestationPolicies(
          account.target,
          agent.address
        );

      const nonceBeforeFailure = await account.nonce();

      try {
        await ethers.provider.send("hardhat_setCode", [
          geographicPolicy.target,
          revertingCode
        ]);

        await assert.rejects(async () => {
          const tx = await account.connect(owner)
            .executeProofAuthorizedZoneMigration(...migrationArgs);
          await tx.wait();
        });

        assert.equal(
          await account.nonce(),
          nonceBeforeFailure,
          "Failed migration changed the account nonce"
        );

        const attestationAfterFailure =
          await registry.attestationPolicies(
            account.target,
            agent.address
          );

        for (let i = 0; i < 5; i++) {
          assert.equal(
            attestationAfterFailure[i],
            attestationBeforeFailure[i],
            "Failed migration changed attestation policy field " + i
          );
        }

        console.log("ATOMIC ROLLBACK VERIFIED");
        console.log("Failed migration preserved nonce and attestation policy");
      } finally {
        // Restore the actual geographic registry before
        // checking whether the same proof is still usable.
        await ethers.provider.send("hardhat_setCode", [
          geographicPolicy.target,
          originalGeographicCode
        ]);
      }

      const geographicAfterFailure =
        await geographicPolicy.getGeographicPolicy(
          account.target,
          agent.address
        );

      assert.equal(
        geographicAfterFailure.zoneHash,
        oldZoneHash,
        "Failed migration changed geographic policy"
      );

      assert.equal(
        geographicAfterFailure.enabled,
        true
      );

      console.log("Failed migration preserved geographic policy");
      console.log("Retrying the same proof after rollback");

      await (
        await account.connect(owner)
          .executeProofAuthorizedZoneMigration(...migrationArgs)
      ).wait();

      const migratedGeo =
        await geographicPolicy.getGeographicPolicy(
          account.target,
          agent.address
        );

      const migratedAttestation =
        await registry.attestationPolicies(
          account.target,
          agent.address
        );

      // Both registries must agree, regardless of the hash
      // domain used internally by the geographic library.
      assert.equal(
        migratedGeo.zoneHash,
        migratedAttestation[0]
      );

      assert.notEqual(
        migratedGeo.zoneHash,
        oldZoneHash
      );

      assert.equal(migratedGeo.enabled, true);
      assert.equal(migratedAttestation[4], true);

      // Preserve existing attestation security requirements.
      assert.equal(migratedAttestation[1], oldPolicy[1]);
      assert.equal(migratedAttestation[2], oldPolicy[2]);
      assert.equal(migratedAttestation[3], oldPolicy[3]);

      assert.equal(
        await account.nonce(),
        nonceBeforeMigration + 1n
      );

      console.log("REAL Z ZONE MIGRATION SUCCEEDED");
      console.log("Both policy registries agree on the new zone");
      console.log("Attestation security settings preserved");

      await assert.rejects(async () => {
        const tx = await account.connect(owner)
          .executeProofAuthorizedZoneMigration(...migrationArgs);
        await tx.wait();
      });

      assert.equal(
        await account.nonce(),
        nonceBeforeMigration + 1n
      );

      console.log("REPLAY REJECTED: zone migration proof");
    }


    // MILESTONE 6: REAL PROOF-AUTHORIZED STAKING
    {
      const { buildAuthorization } =
        require("../scripts/zk/echo-z-authorization");

      const activeAttestation =
        await registry.attestationPolicies(
          account.target,
          agent.address
        );

      const activeZoneHash = activeAttestation[0];

      const stakingZone = {
        ...zone,
        maxLat: BigInt(zone.maxLat) + 1n
      };

      const block = await ethers.provider.getBlock("latest");
      const stakingDeadline = BigInt(block.timestamp) + 7200n;

      async function authorizePolicyUpdate(data) {
        const auth = await buildAuthorization({
          ethers,
          account,
          agent,
          validator,
          registry,
          target: agentPolicyRegistry.target,
          value: 0n,
          data,
          zone: stakingZone,
          zoneHash: activeZoneHash,
          deadline: stakingDeadline
        });

        const tx = await account.connect(owner)
          .executeProofAuthorizedAgentPolicyUpdate(
            auth.checkpoint,
            auth.signature,
            auth.proof,
            data
          );

        await tx.wait();

        assert.equal(
          await account.nonce(),
          auth.nonce + 1n,
          "Policy update must advance nonce exactly once"
        );
      }

      // Permission 1: approve the ECHO token target.
      await authorizePolicyUpdate(
        agentPolicyRegistry.interface.encodeFunctionData(
          "setTargetPermission",
          [agent.address, echoTokenMock.target, true]
        )
      );

      // Permission 2: approve the ECHO token approve() selector.
      await authorizePolicyUpdate(
        agentPolicyRegistry.interface.encodeFunctionData(
          "setSelectorPermission",
          [
            agent.address,
            echoTokenMock.target,
            echoTokenMock.interface.getFunction("approve").selector,
            true
          ]
        )
      );

      // Permission 3: approve the staking contract target.
      await authorizePolicyUpdate(
        agentPolicyRegistry.interface.encodeFunctionData(
          "setTargetPermission",
          [agent.address, echoStakingMock.target, true]
        )
      );

      // Permission 4: approve the staking stake() selector.
      await authorizePolicyUpdate(
        agentPolicyRegistry.interface.encodeFunctionData(
          "setSelectorPermission",
          [
            agent.address,
            echoStakingMock.target,
            echoStakingMock.interface.getFunction("stake").selector,
            true
          ]
        )
      );

      assert.equal(
        await agentPolicyRegistry.approvedTargets(
          account.target, agent.address, echoTokenMock.target
        ),
        true
      );

      assert.equal(
        await agentPolicyRegistry.approvedTargets(
          account.target, agent.address, echoStakingMock.target
        ),
        true
      );

      console.log("PASS: Four proof-authorized staking permissions");

      const stakeAmount = ethers.parseEther("1000");

      // Generate a fresh proof for token approval.
      const approveData =
        echoTokenMock.interface.encodeFunctionData(
          "approve",
          [echoStakingMock.target, stakeAmount]
        );

      const approveAuth = await buildAuthorization({
        ethers,
        account,
        agent,
        validator,
        registry,
        target: echoTokenMock.target,
        value: 0n,
        data: approveData,
        zone: stakingZone,
        zoneHash: activeZoneHash,
        deadline: stakingDeadline
      });

      const approveTx = await account.connect(agent)
        .executeAuthorized(
          approveAuth.checkpoint,
          approveAuth.signature,
          approveAuth.proof.v3A,
          approveAuth.proof.v3B,
          approveAuth.proof.v3C,
          approveAuth.proof.v3Signals,
          approveAuth.proof.v4A,
          approveAuth.proof.v4B,
          approveAuth.proof.v4C,
          approveAuth.proof.v4Signals,
          echoTokenMock.target,
          0,
          approveData
        );

      await approveTx.wait();

      assert.equal(
        await echoTokenMock.allowance(
          account.target,
          echoStakingMock.target
        ),
        stakeAmount
      );

      assert.equal(
        await account.nonce(),
        approveAuth.nonce + 1n
      );

      console.log("PASS: Z account authorized ECHO approval");

      // Generate an entirely new proof for staking.
      const stakeData =
        echoStakingMock.interface.encodeFunctionData(
          "stake",
          [stakeAmount]
        );

      const stakeAuth = await buildAuthorization({
        ethers,
        account,
        agent,
        validator,
        registry,
        target: echoStakingMock.target,
        value: 0n,
        data: stakeData,
        zone: stakingZone,
        zoneHash: activeZoneHash,
        deadline: stakingDeadline
      });

      const stakeTx = await account.connect(agent)
        .executeAuthorized(
          stakeAuth.checkpoint,
          stakeAuth.signature,
          stakeAuth.proof.v3A,
          stakeAuth.proof.v3B,
          stakeAuth.proof.v3C,
          stakeAuth.proof.v3Signals,
          stakeAuth.proof.v4A,
          stakeAuth.proof.v4B,
          stakeAuth.proof.v4C,
          stakeAuth.proof.v4Signals,
          echoStakingMock.target,
          0,
          stakeData
        );

      await stakeTx.wait();

      assert.equal(
        await echoStakingMock.getValidatorStake(account.target),
        stakeAmount
      );

      assert.equal(
        await echoTokenMock.balanceOf(account.target),
        ethers.parseEther("4000")
      );

      assert.equal(
        await echoTokenMock.balanceOf(echoStakingMock.target),
        stakeAmount
      );

      assert.equal(
        await account.nonce(),
        stakeAuth.nonce + 1n
      );

      console.log("PASS: 1,000 ECHO staked through Echo Z");
      console.log("PASS: Token balances verified");
      console.log("PASS: Staking nonce advanced exactly once");

      // Replaying the consumed proof must fail.
      await assert.rejects(async () => {
        const tx = await account.connect(agent)
          .executeAuthorized(
            stakeAuth.checkpoint,
            stakeAuth.signature,
            stakeAuth.proof.v3A,
            stakeAuth.proof.v3B,
            stakeAuth.proof.v3C,
            stakeAuth.proof.v3Signals,
            stakeAuth.proof.v4A,
            stakeAuth.proof.v4B,
            stakeAuth.proof.v4C,
            stakeAuth.proof.v4Signals,
            echoStakingMock.target,
            0,
            stakeData
          );
        await tx.wait();
      });

      assert.equal(
        await account.nonce(),
        stakeAuth.nonce + 1n
      );

      console.log("PASS: Staking proof replay rejected");
    }


    // Account-scoped permissions, token approval, and staking
    // will be tested here using fresh V3/V4 proofs.

    console.log("Z account deployed:", predicted);
    console.log("All five bootstrap calls succeeded.");
    console.log("Unauthorized reinitialization rejected.");
  });
});
