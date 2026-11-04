const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ECHO V3 authorized reentrancy protection", function () {
  it("blocks a valid nested execution, then permits it after the lock clears", async function () {
    const [owner, validator] = await ethers.getSigners();

    const verifier = await (
      await ethers.getContractFactory("MockVerifier")
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

    const probe = await (
      await ethers.getContractFactory("EchoReentrancyProbeV3")
    ).deploy(account.target);

    const target = await (
      await ethers.getContractFactory("TestTarget")
    ).deploy();

    async function admin(contract, functionName, args) {
      const data = contract.interface.encodeFunctionData(
        functionName,
        args
      );

      await (
        await account.executeAdministration(contract.target, data)
      ).wait();
    }

    const zoneHash = ethers.id("ECHO_V3_REENTRANCY_TEST_ZONE");

    const policy = {
      allowedZoneHash: zoneHash,
      maxTimeDrift: 3600,
      requiredTier: 0,
      allowValidatorFallback: false,
      enabled: true
    };

    await admin(registry, "setCheckpointBridge", [
      bridge.target, true
    ]);

    await admin(registry, "setValidatorSigner", [
      validator.address, true
    ]);

    for (const delegatee of [owner.address, probe.target]) {
      await admin(bridge, "setAuthorizedDelegatee", [
        delegatee, true
      ]);

      await admin(registry, "setAttestationPolicy", [
        delegatee, policy
      ]);
    }

    const network = await ethers.provider.getNetwork();
    expect(network.chainId).to.equal(31337n);

    const timestamp = BigInt(
      (await ethers.provider.getBlock("latest")).timestamp
    );

    const domain = {
      name: "EchoAttestationRegistryV3",
      version: "1",
      chainId: network.chainId,
      verifyingContract: registry.target
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

    const proofA = [0, 0];
    const proofB = [[0, 0], [0, 0]];
    const proofC = [0, 0];

    async function authorization(
      delegatee, nonce, nullifier, destination, callData
    ) {
      const checkpoint = {
        account: account.target,
        delegatee,
        zoneHash,
        checkpointCommitment: ethers.id(
          "checkpoint-" + nonce.toString()
        ),
        authorizationCommitment: ethers.id(
          "authorization-" + nonce.toString()
        ),
        timestamp,
        nonce
      };

      const signature = await validator.signTypedData(
        domain, types, checkpoint
      );

      const signals = Array(20).fill(0n);
      const hash = BigInt(ethers.keccak256(callData));
      const mask = (1n << 128n) - 1n;

      signals[1] = BigInt(checkpoint.authorizationCommitment);
      signals[2] = nullifier;
      signals[3] = BigInt(account.target);
      signals[4] = BigInt(delegatee);
      signals[5] = BigInt(validator.address);
      signals[6] = BigInt(destination);
      signals[7] = 0n;
      signals[8] = hash & mask;
      signals[9] = hash >> 128n;
      signals[10] = network.chainId;
      signals[11] = nonce;
      signals[12] = timestamp + 3600n;
      signals[16] = timestamp - 60n;
      signals[17] = timestamp + 3600n;
      signals[18] = BigInt(checkpoint.checkpointCommitment);
      signals[19] = BigInt(checkpoint.timestamp);

      return [
        checkpoint,
        signature,
        proofA,
        proofB,
        proofC,
        signals,
        destination,
        0,
        callData
      ];
    }

    const targetData = target.interface.encodeFunctionData(
      "setValue", [777]
    );

    const innerArgs = await authorization(
      probe.target, 1n, 1002n, target.target, targetData
    );

    const innerCall = account.interface.encodeFunctionData(
      "executeAuthorized", innerArgs
    );

    const probeData = probe.interface.encodeFunctionData(
      "attemptCallback", [innerCall]
    );

    const outerArgs = await authorization(
      owner.address, 0n, 1001n, probe.target, probeData
    );

    console.log("Executing valid outer authorization...");

    await (
      await account.connect(owner).executeAuthorized(...outerArgs)
    ).wait();

    expect(await account.nonce()).to.equal(1n);
    expect(await probe.callbackSucceeded()).to.equal(false);
    expect(await target.storedValue()).to.equal(0n);

    const revertData = await probe.callbackResult();
    const parsed = account.interface.parseError(revertData);

    expect(parsed).to.not.equal(null);
    expect(parsed.name).to.equal("Unauthorized");

    console.log("Nested execution blocked by active lock.");
    console.log("Outer transaction succeeded; nonce is 1.");

    console.log("Retrying identical inner authorization after unlock...");

    await (await probe.attemptCallback(innerCall)).wait();

    expect(await probe.callbackSucceeded()).to.equal(true);
    expect(await account.nonce()).to.equal(2n);
    expect(await target.storedValue()).to.equal(777n);

    console.log("Same inner authorization succeeded after unlock.");
    console.log("Target value: 777");
    console.log("Final nonce: 2");
    console.log("REENTRANCY GUARD BEHAVIOR VERIFIED");
  });
});
