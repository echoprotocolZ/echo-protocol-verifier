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
        { name: "salt", type: "bytes32" },
        { name: "configHash", type: "bytes32" },
        { name: "deadline", type: "uint256" }
      ]
    };

    const signature = await owner.signTypedData(domain, types, {
      owner: owner.address,
      entryPoint: ethers.ZeroAddress,
      bridge: v4Bridge.target,
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
        salt,
        targets,
        calls,
        deadline,
        signature
      );
      await tx.wait();
    });

    console.log("Rejected: duplicate CREATE2 deployment");

    console.log("Z account deployed:", predicted);
    console.log("All five bootstrap calls succeeded.");
    console.log("Unauthorized reinitialization rejected.");
  });
});
