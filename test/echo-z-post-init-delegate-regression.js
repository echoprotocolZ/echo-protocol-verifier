const { expect } = require("chai");
const { ethers } = require("hardhat");
const assert = require("node:assert/strict");

describe("Echo Protocol Z post-initialization delegate regression", function () {
  async function deploy(name, ...args) {
    const c = await (await ethers.getContractFactory(name)).deploy(...args);
    await c.waitForDeployment();
    return c;
  }

  async function fixture() {
    const [owner, validator, agent, outsider, replacement] = await ethers.getSigners();
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

    const zone = { minLat: 100000, maxLat: 101000, minLon: 199000, maxLon: 201000 };
    const zoneHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint32", "uint32", "uint32", "uint32"],
      [ethers.id("ECHO_V4_GEOGRAPHIC_ZONE_V1"), zone.minLat, zone.maxLat, zone.minLon, zone.maxLon]
    ));
    const policy = { allowedZoneHash: zoneHash, maxTimeDrift: 3600, requiredTier: 0, allowValidatorFallback: false, enabled: true };
    const targets = [registry.target, registry.target, registry.target, bridge.target, geoPolicies.target];
    const calls = [
      registry.interface.encodeFunctionData("setCheckpointBridge", [bridge.target, true]),
      registry.interface.encodeFunctionData("setValidatorSigner", [validator.address, true]),
      registry.interface.encodeFunctionData("setAttestationPolicy", [agent.address, policy]),
      bridge.interface.encodeFunctionData("setAuthorizedDelegatee", [agent.address, true]),
      geoPolicies.interface.encodeFunctionData("setGeographicPolicy", [agent.address, zone])
    ];
    const salt = ethers.id("echo-z-post-init-delegate-regression");
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const configHash = await factory.configurationHash(targets, calls);
    const network = await ethers.provider.getNetwork();
    const domain = { name: "EchoAccountFactoryZ", version: "1", chainId: network.chainId, verifyingContract: factory.target };
    const types = { Deploy: [
      { name: "owner", type: "address" }, { name: "entryPoint", type: "address" },
      { name: "bridge", type: "address" }, { name: "agentPolicyRegistry", type: "address" },
      { name: "salt", type: "bytes32" }, { name: "configHash", type: "bytes32" },
      { name: "deadline", type: "uint256" }
    ] };
    const signature = await owner.signTypedData(domain, types, {
      owner: owner.address, entryPoint: ethers.ZeroAddress, bridge: bridge.target,
      agentPolicyRegistry: agentPolicies.target, salt, configHash, deadline
    });
    const address = await factory.predictAccountAddress(owner.address, ethers.ZeroAddress, bridge.target, salt);
    await (await factory.createAccount(owner.address, ethers.ZeroAddress, bridge.target,
      agentPolicies.target, salt, targets, calls, deadline, signature)).wait();
    const account = await ethers.getContractAt("EchoSmartAccountZ", address);
    expect(await account.initialized()).to.equal(true);
    expect(await bridge.authorizedDelegatees(address, agent.address)).to.equal(true);
    return { owner, agent, outsider, replacement, bridge, account, agentPolicies };
  }

  it("isolates account delegate permissions from outsider and owner direct bridge calls", async function () {
    const { owner, agent, outsider, replacement, bridge, account } = await fixture();
    const address = await account.getAddress();
    const nonceBefore = await account.nonce();
    for (const caller of [outsider, owner, agent]) {
      await (await bridge.connect(caller).setAuthorizedDelegatee(replacement.address, true)).wait();
      await (await bridge.connect(caller).setAuthorizedDelegatee(agent.address, false)).wait();
      expect(await bridge.authorizedDelegatees(address, replacement.address)).to.equal(false);
      expect(await bridge.authorizedDelegatees(address, agent.address)).to.equal(true);
    }
    expect(await account.nonce()).to.equal(nonceBefore);
  });

  it("rejects proof-free executeAuthorized calls targeting the bridge", async function () {
    const { owner, agent, replacement, bridge, account } = await fixture();
    const address = await account.getAddress();
    const nonceBefore = await account.nonce();
    const checkpoint = {
      account: address, delegatee: agent.address,
      zoneHash: ethers.ZeroHash, checkpointCommitment: ethers.ZeroHash,
      authorizationCommitment: ethers.ZeroHash, timestamp: 0, nonce: nonceBefore
    };
    const zeros2 = [0n, 0n];
    const zerosB = [[0n, 0n], [0n, 0n]];
    const data = bridge.interface.encodeFunctionData("setAuthorizedDelegatee", [
      replacement.address, true
    ]);
    await assert.rejects(async () => {
      const tx = await account.connect(owner).executeAuthorized(
        checkpoint, "0x",
        zeros2, zerosB, zeros2, Array(20).fill(0n),
        zeros2, zerosB, zeros2, Array(5).fill(0n),
        bridge.target, 0n, data
      );
      await tx.wait();
    });
    assert.equal(await bridge.authorizedDelegatees(address, replacement.address), false);
    assert.equal(await bridge.authorizedDelegatees(address, agent.address), true);
    assert.equal(await account.nonce(), nonceBefore);
  });

  it("prevents outsiders from granting account-scoped indirect spender permissions", async function () {
    const { owner, agent, outsider, account, agentPolicies } = await fixture();
    const spender = await deploy("EchoIndirectTokenSpenderTestMock");
    const accountAddress = await account.getAddress();
    const selector = spender.interface.getFunction("pull").selector;
    const nonceBefore = await account.nonce();

    await (await agentPolicies.connect(outsider).setAgentPolicy(
      agent.address, 0n,
      BigInt((await ethers.provider.getBlock("latest")).timestamp) + 3600n,
      true
    )).wait();
    await (await agentPolicies.connect(outsider).setTargetPermission(
      agent.address, spender.target, true
    )).wait();
    await (await agentPolicies.connect(outsider).setSelectorPermission(
      agent.address, spender.target, selector, true
    )).wait();

    assert.equal(await agentPolicies.approvedTargets(outsider.address, agent.address, spender.target), true);
    assert.equal(await agentPolicies.approvedTargets(accountAddress, agent.address, spender.target), false);
    assert.equal(await agentPolicies.approvedSelectors(accountAddress, agent.address, spender.target, selector), false);

    const calldata = spender.interface.encodeFunctionData("pull", [
      owner.address, accountAddress, outsider.address, 1n
    ]);
    await assert.rejects(
      agentPolicies.validateExecution(accountAddress, agent.address, spender.target, 0n, calldata)
    );
    assert.equal(await account.nonce(), nonceBefore);
  });

  it("rejects an unallowlisted indirect token pull at the real execution entrypoint", async function () {
    const { owner, agent, outsider, account, agentPolicies } = await fixture();
    const token = await deploy("EchoTokenTestMock");
    const spender = await deploy("EchoIndirectTokenSpenderTestMock");
    const accountAddress = await account.getAddress();
    await (await token.transfer(accountAddress, 100n)).wait();
    const nonceBefore = await account.nonce();
    const balanceBefore = await token.balanceOf(accountAddress);
    const recipientBefore = await token.balanceOf(outsider.address);
    const data = spender.interface.encodeFunctionData("pull", [
      token.target, accountAddress, outsider.address, 10n
    ]);
    const checkpoint = {
      account: accountAddress, delegatee: agent.address,
      zoneHash: ethers.ZeroHash, checkpointCommitment: ethers.ZeroHash,
      authorizationCommitment: ethers.ZeroHash, timestamp: 0, nonce: nonceBefore
    };
    const zero2 = [0n, 0n];
    const zeroB = [[0n, 0n], [0n, 0n]];
    assert.equal(
      await agentPolicies.approvedTargets(accountAddress, agent.address, spender.target), false
    );
    await assert.rejects(async () => {
      const tx = await account.connect(owner).executeAuthorized(
        checkpoint, "0x",
        zero2, zeroB, zero2, Array(20).fill(0n),
        zero2, zeroB, zero2, Array(5).fill(0n),
        spender.target, 0n, data
      );
      await tx.wait();
    });
    assert.equal(await account.nonce(), nonceBefore);
    assert.equal(await token.balanceOf(accountAddress), balanceBefore);
    assert.equal(await token.balanceOf(outsider.address), recipientBefore);
  });

  it("rejects reinitialization that attempts to replace the delegate", async function () {
    const { owner, agent, replacement, bridge, account } = await fixture();
    const address = await account.getAddress();
    const data = bridge.interface.encodeFunctionData("setAuthorizedDelegatee", [replacement.address, true]);
    await assert.rejects(async () => {
      const tx = await account.connect(owner).initialize([bridge.target], [data]);
      await tx.wait();
    });
    expect(await bridge.authorizedDelegatees(address, replacement.address)).to.equal(false);
    expect(await bridge.authorizedDelegatees(address, agent.address)).to.equal(true);
  });

  it("rejects proof-free agent-policy changes without consuming nonce", async function () {
    const { owner, outsider, agent, account, agentPolicies } = await fixture();
    const nonceBefore = await account.nonce();
    const checkpoint = {
      account: await account.getAddress(), delegatee: agent.address,
      zoneHash: ethers.ZeroHash, checkpointCommitment: ethers.ZeroHash,
      authorizationCommitment: ethers.ZeroHash, timestamp: 0, nonce: nonceBefore
    };
    const proof = {
      v3A: [0, 0], v3B: [[0, 0], [0, 0]], v3C: [0, 0],
      v3Signals: Array(20).fill(0), v4A: [0, 0],
      v4B: [[0, 0], [0, 0]], v4C: [0, 0], v4Signals: Array(5).fill(0)
    };
    const data = agentPolicies.interface.encodeFunctionData("setTargetPermission",
      [agent.address, outsider.address, true]);
    for (const caller of [outsider, owner]) {
      await assert.rejects(async () => {
        const tx = await account.connect(caller).executeProofAuthorizedAgentPolicyUpdate(
          checkpoint, "0x", proof, data);
        await tx.wait();
      });
      expect(await account.nonce()).to.equal(nonceBefore);
    }
  });
});
