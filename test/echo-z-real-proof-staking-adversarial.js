const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const { proveAuthorizedCall, ZONE } = require("./helpers/echo-real-dual-proof");

describe("Echo Z — real dual-Groth16 staking integration", function () {
  this.timeout(600000);

  async function deploy(name, ...args) {
    const c = await (await ethers.getContractFactory(name)).deploy(...args);
    await c.waitForDeployment();
    return c;
  }

  it("rejects mutated proof, calldata and unauthorized staking without consuming authorization", async function () {
    const [owner, validator] = await ethers.getSigners();
    const agent = owner;
    const verifier = await deploy("EchoAuthorizationVerifierV3");
    const registry = await deploy("EchoAttestationRegistryV3");
    const v3Bridge = await deploy("EchoAuthorizationBridgeV3", verifier.target, registry.target);
    const agentPolicies = await deploy("EchoAgentPolicyRegistryZ");
    const geoPolicies = await deploy("EchoGeographicPolicyRegistryV4");
    const geoVerifier = await deploy("EchoGeographicBoundVerifierV4");
    const gateway = await deploy("EchoGeographicProofGatewayV4", geoVerifier.target, geoPolicies.target);
    const dualVerifier = await deploy("EchoDualProofVerifierV4", v3Bridge.target, gateway.target);
    const bridge = await deploy("EchoAuthorizationBridgeV4", dualVerifier.target, registry.target);
    const factory = await deploy("EchoAccountFactoryZ");
    const token = await deploy("EchoTokenTestMock");
    const staking = await deploy("EchoStakingSourceFixture", token.target);
    const amount = ethers.parseEther("1000");

    const zoneHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint32", "uint32", "uint32", "uint32"],
      [ethers.id("ECHO_V4_GEOGRAPHIC_ZONE_V1"), ZONE.minLat, ZONE.maxLat, ZONE.minLon, ZONE.maxLon]
    ));
    const attestation = { allowedZoneHash: zoneHash, maxTimeDrift: 3600,
      requiredTier: 0, allowValidatorFallback: false, enabled: true };
    const targets = [registry.target, registry.target, registry.target, bridge.target, geoPolicies.target];
    const calls = [
      registry.interface.encodeFunctionData("setCheckpointBridge", [bridge.target, true]),
      registry.interface.encodeFunctionData("setValidatorSigner", [validator.address, true]),
      registry.interface.encodeFunctionData("setAttestationPolicy", [agent.address, attestation]),
      bridge.interface.encodeFunctionData("setAuthorizedDelegatee", [agent.address, true]),
      geoPolicies.interface.encodeFunctionData("setGeographicPolicy", [agent.address, ZONE])
    ];
    const salt = ethers.id("echo-z-real-dual-proof-staking-v1");
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const configHash = await factory.configurationHash(targets, calls);
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const signature = await owner.signTypedData(
      { name: "EchoAccountFactoryZ", version: "1", chainId, verifyingContract: factory.target },
      { Deploy: [
        { name: "owner", type: "address" }, { name: "entryPoint", type: "address" },
        { name: "bridge", type: "address" }, { name: "agentPolicyRegistry", type: "address" },
        { name: "salt", type: "bytes32" }, { name: "configHash", type: "bytes32" },
        { name: "deadline", type: "uint256" }
      ] },
      { owner: owner.address, entryPoint: ethers.ZeroAddress, bridge: bridge.target,
        agentPolicyRegistry: agentPolicies.target, salt, configHash, deadline }
    );
    const address = await factory.predictAccountAddress(owner.address, ethers.ZeroAddress, bridge.target, salt);
    await (await factory.createAccount(owner.address, ethers.ZeroAddress, bridge.target,
      agentPolicies.target, salt, targets, calls, deadline, signature)).wait();
    const account = await ethers.getContractAt("EchoSmartAccountZ", address);
    assert.equal(await account.initialized(), true);

    const hash = ethers.keccak256(await ethers.provider.getCode(staking.target));
    await (await factory.setStakingCodehashApproval(hash, true)).wait();
    await (await factory.setStakingTargetApproval(staking.target, token.target, true)).wait();
    assert.equal(await factory.isApprovedStakingTarget(staking.target), true);

    async function proof(target, data) {
      return proveAuthorizedCall({
        account: address, delegatee: agent.address, validator, registry: registry.target,
        target, data, nonce: await account.nonce()
      });
    }
    function proofStruct(p) {
      return { v3A: p.v3A, v3B: p.v3B, v3C: p.v3C, v3Signals: p.v3Signals,
        v4A: p.v4A, v4B: p.v4B, v4C: p.v4C, v4Signals: p.v4Signals };
    }
    async function policyUpdate(data) {
      const p = await proof(agentPolicies.target, data);
      await (await account.executeProofAuthorizedAgentPolicyUpdate(
        p.checkpoint, p.signature, proofStruct(p), data
      )).wait();
    }

    const expiry = BigInt((await ethers.provider.getBlock("latest")).timestamp) + 86400n;
    await policyUpdate(agentPolicies.interface.encodeFunctionData(
      "setAgentPolicy", [agent.address, 0n, expiry, true]
    ));
    await policyUpdate(agentPolicies.interface.encodeFunctionData(
      "setTargetPermission", [agent.address, staking.target, true]
    ));
    await policyUpdate(agentPolicies.interface.encodeFunctionData(
      "setSelectorPermission", [agent.address, staking.target,
        staking.interface.getFunction("stake").selector, true]
    ));

    const budgetData = account.interface.encodeFunctionData(
      "setTokenSpendingBudget", [agent.address, token.target, amount]
    );
    const budgetProof = await proof(address, budgetData);
    await (await account.executeProofAuthorizedSpendingBudgetUpdate(
      budgetProof.checkpoint, budgetProof.signature, proofStruct(budgetProof),
      token.target, amount
    )).wait();
    assert.equal(await account.tokenSpendingBudgets(agent.address, token.target), amount);

    const targetData = account.interface.encodeFunctionData(
      "setTrustedStakingTarget", [agent.address, staking.target]
    );
    const targetProof = await proof(address, targetData);
    await (await account.executeProofAuthorizedStakingTargetUpdate(
      targetProof.checkpoint, targetProof.signature, proofStruct(targetProof), staking.target
    )).wait();
    assert.equal(await account.trustedStakingTarget(agent.address), staking.target);

    await (await token.transfer(address, amount)).wait();
    const stakeData = staking.interface.encodeFunctionData("stake", [amount]);
    const stakeProof = await proof(staking.target, stakeData);
    const stakeArgs = [
      stakeProof.checkpoint, stakeProof.signature,
      stakeProof.v3A, stakeProof.v3B, stakeProof.v3C, stakeProof.v3Signals,
      stakeProof.v4A, stakeProof.v4B, stakeProof.v4C, stakeProof.v4Signals,
      staking.target, 0n, stakeData
    ];
    // A failed transaction must roll back nonce, nullifier and allowance.
    const nonceBefore = await account.nonce();
    const usedBefore = await account.tokenSpendingUsed(agent.address, token.target);
    const balanceBefore = await token.balanceOf(address);
    async function rejectsWithoutStateChange(label, args) {
      await assert.rejects(async () => {
        const tx = await account.executeAuthorized(...args);
        await tx.wait();
      }, undefined, label);
      assert.equal(await account.nonce(), nonceBefore, label + ": nonce changed");
      assert.equal(await bridge.consumedNullifiers(stakeProof.nullifier), false,
        label + ": nullifier consumed");
      assert.equal(await token.allowance(address, staking.target), 0n,
        label + ": allowance left behind");
      assert.equal(await token.balanceOf(address), balanceBefore,
        label + ": token balance changed");
      assert.equal(await account.tokenSpendingUsed(agent.address, token.target),
        usedBefore, label + ": budget usage changed");
      assert.equal(await staking.totalStaked(), 0n, label + ": stake changed");
    }

    const alteredAmount = staking.interface.encodeFunctionData("stake", [amount + 1n]);
    await rejectsWithoutStateChange("mutated stake amount",
      [...stakeArgs.slice(0, -1), alteredAmount]);

    const alteredSignals = [...stakeProof.v3Signals];
    alteredSignals[11] = (BigInt(alteredSignals[11]) + 1n).toString();
    await rejectsWithoutStateChange("mutated nonce public signal",
      [...stakeArgs.slice(0, 5), alteredSignals, ...stakeArgs.slice(6)]);

    const alteredCheckpoint = {
      ...stakeProof.checkpoint,
      authorizationCommitment: ethers.id("tampered authorization")
    };
    await rejectsWithoutStateChange("tampered checkpoint",
      [alteredCheckpoint, ...stakeArgs.slice(1)]);

    const [, , outsider] = await ethers.getSigners();
    await assert.rejects(async () => {
      const tx = await account.connect(outsider).executeAuthorized(...stakeArgs);
      await tx.wait();
    });
    assert.equal(await account.nonce(), nonceBefore);
    assert.equal(await bridge.consumedNullifiers(stakeProof.nullifier), false);

    // A genuine, untouched authorization remains valid after failed attempts.

    await (await account.executeAuthorized(...stakeArgs)).wait();
    assert.equal(await account.nonce(), nonceBefore + 1n);
    assert.equal(await staking.getValidatorStake(address), amount);
    assert.equal(await staking.totalStaked(), amount);
    assert.equal(await token.balanceOf(address), 0n);
    assert.equal(await token.balanceOf(staking.target), amount);
    assert.equal(await token.allowance(address, staking.target), 0n);
    assert.equal(await account.tokenSpendingUsed(agent.address, token.target), amount);
    assert.equal(await bridge.consumedNullifiers(stakeProof.nullifier), true);

    await assert.rejects(async () => {
      const tx = await account.executeAuthorized(...stakeArgs);
      await tx.wait();
    });
    assert.equal(await account.nonce(), nonceBefore + 1n);
    assert.equal(await staking.totalStaked(), amount);
    assert.equal(await token.allowance(address, staking.target), 0n);
  });
});
