const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const { proveAuthorizedCall, ZONE } = require("./helpers/echo-real-dual-proof");

describe("Echo Z — real dual-Groth16 monitored transfer", function () {
  this.timeout(600000);

  async function deploy(name, ...args) {
    const c = await (await ethers.getContractFactory(name)).deploy(...args);
    await c.waitForDeployment();
    return c;
  }

  it("executes canonical transfer and rolls back over-budget transfer", async function () {
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
      "setTargetPermission", [agent.address, token.target, true]
    ));
    await policyUpdate(agentPolicies.interface.encodeFunctionData(
      "setSelectorPermission", [agent.address, token.target,
        token.interface.getFunction("transfer").selector, true]
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

    await (await token.transfer(address, amount * 2n)).wait();
    const recipient = validator.address;
    const initialRecipient = await token.balanceOf(recipient);
    async function args(data) {
      const p = await proof(token.target, data);
      return { p, values: [p.checkpoint, p.signature, p.v3A, p.v3B, p.v3C, p.v3Signals,
        p.v4A, p.v4B, p.v4C, p.v4Signals, token.target, 0n, data] };
    }
    const data = token.interface.encodeFunctionData("transfer", [recipient, amount]);
    assert.equal(ethers.dataLength(data), 68);
    const valid = await args(data);
    const before = await account.nonce();
    await (await account.executeAuthorized(...valid.values)).wait();
    assert.equal(await account.nonce(), before + 1n);
    assert.equal(await token.balanceOf(address), amount);
    assert.equal(await token.balanceOf(recipient), initialRecipient + amount);
    assert.equal(await account.tokenSpendingUsed(agent.address, token.target), amount);
    assert.equal(await bridge.consumedNullifiers(valid.p.nullifier), true);
    const excess = await args(token.interface.encodeFunctionData("transfer", [recipient, 1n]));
    await assert.rejects(async () => {
      await account.executeAuthorized.staticCall(...excess.values);
    }, e => {
      assert.equal(e.data, account.interface.getError("SpendingBudgetExceeded").selector);
      return true;
    });
    await assert.rejects(async () => {
      await (await account.executeAuthorized(...excess.values, {gasLimit: 8000000})).wait();
    });
    assert.equal(await account.nonce(), before + 1n);
    assert.equal(await token.balanceOf(address), amount);
    assert.equal(await token.balanceOf(recipient), initialRecipient + amount);
    assert.equal(await account.tokenSpendingUsed(agent.address, token.target), amount);
    assert.equal(await bridge.consumedNullifiers(excess.p.nullifier), false);

    // Permission lifecycle must never replenish the cumulative budget.
    await policyUpdate(agentPolicies.interface.encodeFunctionData(
      "setAgentPolicy", [agent.address, 0n, expiry, false]
    ));
    assert.equal((await agentPolicies.agentPolicies(address, agent.address)).enabled, false);
    const disabled = await args(token.interface.encodeFunctionData("transfer", [recipient, 1n]));
    const disabledNonce = await account.nonce();
    await assert.rejects(async () => {
      await account.executeAuthorized.staticCall(...disabled.values);
    }, e => {
      assert.equal(e.data, account.interface.getError("Unauthorized").selector);
      return true;
    });
    assert.equal(await account.nonce(), disabledNonce);
    assert.equal(await bridge.consumedNullifiers(disabled.p.nullifier), false);
    assert.equal(await account.tokenSpendingUsed(agent.address, token.target), amount);

    await policyUpdate(agentPolicies.interface.encodeFunctionData(
      "setAgentPolicy", [agent.address, 0n, expiry, true]
    ));
    assert.equal((await agentPolicies.agentPolicies(address, agent.address)).enabled, true);
    assert.equal(await account.tokenSpendingBudgets(agent.address, token.target), amount);
    assert.equal(await account.tokenSpendingUsed(agent.address, token.target), amount);
    const renewed = await args(token.interface.encodeFunctionData("transfer", [recipient, 1n]));
    const renewedNonce = await account.nonce();
    await assert.rejects(async () => {
      await account.executeAuthorized.staticCall(...renewed.values);
    }, e => {
      assert.equal(e.data, account.interface.getError("SpendingBudgetExceeded").selector);
      return true;
    });
    await assert.rejects(async () => {
      await (await account.executeAuthorized(...renewed.values, {gasLimit: 8000000})).wait();
    });
    assert.equal(await account.nonce(), renewedNonce);
    assert.equal(await bridge.consumedNullifiers(renewed.p.nullifier), false);
    assert.equal(await token.balanceOf(address), amount);
    assert.equal(await token.balanceOf(recipient), initialRecipient + amount);
    assert.equal(await account.tokenSpendingUsed(agent.address, token.target), amount);

    // Even owner-approved, correctly bound proofs cannot loosen a budget.
    const otherToken = await deploy("EchoTokenTestMock");
    const expectedError = account.interface.encodeErrorResult("ExecutionFailed", [
      account.interface.encodeErrorResult("InvalidSpendingBudget", [])
    ]);
    for (const [candidateToken, candidateBudget] of [
      [token.target, amount + 1n],
      [token.target, amount - 1n],
      [otherToken.target, amount]
    ]) {
      const update = account.interface.encodeFunctionData("setTokenSpendingBudget",
        [agent.address, candidateToken, candidateBudget]);
      const p = await proof(address, update);
      const params = [p.checkpoint, p.signature, proofStruct(p), candidateToken, candidateBudget];
      const nonceBeforeUpdate = await account.nonce();
      await assert.rejects(async () => {
        await account.executeProofAuthorizedSpendingBudgetUpdate.staticCall(...params);
      }, e => {
        assert.equal(e.data, expectedError);
        return true;
      });
      await assert.rejects(async () => {
        await (await account.executeProofAuthorizedSpendingBudgetUpdate(
          ...params, {gasLimit: 8000000}
        )).wait();
      });
      assert.equal(await account.nonce(), nonceBeforeUpdate);
      assert.equal(await bridge.consumedNullifiers(p.nullifier), false);
      assert.equal(await account.monitoredToken(agent.address), token.target);
      assert.equal(await account.tokenSpendingBudgets(agent.address, token.target), amount);
      assert.equal(await account.tokenSpendingUsed(agent.address, token.target), amount);
      assert.equal(await account.tokenSpendingBudgetConfigured(agent.address, otherToken.target), false);
      assert.equal(await token.balanceOf(address), amount);
      assert.equal(await token.balanceOf(recipient), initialRecipient + amount);
    }
  });
});
