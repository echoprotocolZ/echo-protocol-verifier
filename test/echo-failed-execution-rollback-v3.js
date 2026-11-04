const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ECHO V3 failed execution rollback", function () {
  it("rolls back nonce, nullifier and checkpoint after target failure", async function () {
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


    const failingData = target.interface.encodeFunctionData(
      "fail", []
    );

    const args = await authorization(
      owner.address, 0n, 2001n, target.target, failingData
    );

    const digest = await registry.checkpointDigest(args[0]);

    expect(await account.nonce()).to.equal(0n);
    expect(await bridge.consumedNullifiers(2001n)).to.equal(false);
    expect(await registry.consumedCheckpoints(digest)).to.equal(false);

    let executionFailed = false;

    try {
      const tx = await account.connect(owner).executeAuthorized(...args);
      await tx.wait();
    } catch (error) {
      const revertData =
        error.data ||
        error.info?.error?.data ||
        error.error?.data;

      if (typeof revertData === "string") {
        const parsed = account.interface.parseError(revertData);
        executionFailed = parsed?.name === "ExecutionFailed";
      } else {
        executionFailed = error.message.includes("ExecutionFailed");
      }
    }

    expect(
      executionFailed,
      "Expected the authorized target call to revert with ExecutionFailed"
    ).to.equal(true);

    expect(await account.nonce()).to.equal(0n);
    expect(await bridge.consumedNullifiers(2001n)).to.equal(false);
    expect(await registry.consumedCheckpoints(digest)).to.equal(false);

    expect(
      await registry.consumedCheckpointNonces(
        account.target, owner.address, 0n
      )
    ).to.equal(false);

    console.log("Failed execution reverted successfully.");
    console.log("Account nonce unchanged: 0");
    console.log("Nullifier remains unused: 2001");
    console.log("Checkpoint remains unconsumed.");
    console.log("Checkpoint nonce remains available.");
    console.log("AUTHORIZATION ROLLBACK VERIFIED");

    // A new authorization can use the nonce preserved by the failure.
    const recoveryData = target.interface.encodeFunctionData(
      "setValue", [888]
    );

    const recoveryArgs = await authorization(
      owner.address, 0n, 2002n, target.target, recoveryData
    );

    const recoveryDigest = await registry.checkpointDigest(
      recoveryArgs[0]
    );

    await (
      await account.connect(owner).executeAuthorized(...recoveryArgs)
    ).wait();

    expect(await account.nonce()).to.equal(1n);
    expect(await target.storedValue()).to.equal(888n);
    expect(await bridge.consumedNullifiers(2002n)).to.equal(true);
    expect(await registry.consumedCheckpoints(recoveryDigest)).to.equal(true);

    // The original failed authorization must remain unconsumed.
    expect(await bridge.consumedNullifiers(2001n)).to.equal(false);

    console.log("Recovery transaction succeeded.");
    console.log("Recovered account nonce: 1");
    console.log("Target stored value: 888");
    console.log("New nullifier 2002 consumed.");
    console.log("Original failed nullifier 2001 remains unused.");
    console.log("AUTHORIZATION RECOVERY VERIFIED");
  });
});
