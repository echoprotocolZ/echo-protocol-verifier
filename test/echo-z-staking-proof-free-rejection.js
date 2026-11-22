const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

// Real EchoSmartAccountZ + EchoStakingSourceFixture, but deliberately INVALID proofs.
// Positive Groth16 end-to-end execution is NOT covered by this suite.
describe("Echo Z staking — proof-free execution must fail atomically", function () {
  async function deploy(name, ...args) {
    const c = await (await ethers.getContractFactory(name)).deploy(...args);
    await c.waitForDeployment();
    return c;
  }

  async function fixture() {
    const [owner, validator, agent, outsider] = await ethers.getSigners();
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
    const salt = ethers.id("echo-z-proof-free-staking-production-source");
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const configHash = await factory.configurationHash(targets, calls);
    const chain = await ethers.provider.getNetwork();
    const signature = await owner.signTypedData(
      { name: "EchoAccountFactoryZ", version: "1", chainId: chain.chainId, verifyingContract: factory.target },
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
    const amount = ethers.parseEther("1000");
    await (await token.transfer(address, amount)).wait();
    return { owner, agent, outsider, account, staking, token, amount };
  }

  function blankCheckpoint(account, agent, nonce) {
    return {
      account, delegatee: agent,
      zoneHash: ethers.ZeroHash, checkpointCommitment: ethers.ZeroHash,
      authorizationCommitment: ethers.ZeroHash, timestamp: 0, nonce
    };
  }

  async function attempt({ caller, account, agent, staking, amount }) {
    const checkpoint = blankCheckpoint(account.target, agent.address, await account.nonce());
    const zero2 = [0n, 0n], zeroB = [[0n, 0n], [0n, 0n]];
    const data = staking.interface.encodeFunctionData("stake", [amount]);
    const tx = await account.connect(caller).executeAuthorized(
      checkpoint, "0x",
      zero2, zeroB, zero2, Array(20).fill(0n),
      zero2, zeroB, zero2, Array(5).fill(0n),
      staking.target, 0n, data
    );
    await tx.wait();
  }

  it("rejects a proof-free stake from the account owner without spending tokens or nonce", async function () {
    const f = await fixture();
    const before = await f.token.balanceOf(f.account.target);
    const nonce = await f.account.nonce();
    await assert.rejects(attempt({ ...f, caller: f.owner }));
    assert.equal(await f.account.nonce(), nonce);
    assert.equal(await f.token.balanceOf(f.account.target), before);
    assert.equal(await f.token.balanceOf(f.staking.target), 0n);
    assert.equal(await f.token.allowance(f.account.target, f.staking.target), 0n);
    assert.equal(await f.staking.totalStaked(), 0n);
  });

  it("rejects a proof-free stake from the authorized delegate without spending tokens", async function () {
    const f = await fixture();
    await assert.rejects(attempt({ ...f, caller: f.agent }));
    assert.equal(await f.account.nonce(), 0n);
    assert.equal(await f.token.balanceOf(f.account.target), f.amount);
    assert.equal(await f.token.allowance(f.account.target, f.staking.target), 0n);
    assert.equal(await f.staking.totalStaked(), 0n);
  });

  it("rejects an outsider even before proof verification", async function () {
    const f = await fixture();
    await assert.rejects(attempt({ ...f, caller: f.outsider }));
    assert.equal(await f.account.nonce(), 0n);
    assert.equal(await f.token.balanceOf(f.account.target), f.amount);
    assert.equal(await f.staking.totalStaked(), 0n);
  });
});
