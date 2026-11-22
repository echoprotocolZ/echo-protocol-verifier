const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

describe("ECHO V3 authenticated checkpoint replay boundary (local)", function () {
  it("consumes a signed checkpoint once and rejects replay and same-nonce variants", async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    const [account, validator, delegatee] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    await registry.waitForDeployment();
    const zone = ethers.keccak256(ethers.toUtf8Bytes("local-replay-zone"));
    await (await registry.connect(account).setValidatorSigner(validator.address, true)).wait();
    await (await registry.connect(account).setAttestationPolicy(delegatee.address, {
      allowedZoneHash: zone, maxTimeDrift: 3600, requiredTier: 0,
      allowValidatorFallback: false, enabled: true
    })).wait();
    const block = await ethers.provider.getBlock("latest");
    const checkpoint = {
      account: account.address, delegatee: delegatee.address, zoneHash: zone,
      checkpointCommitment: ethers.keccak256(ethers.toUtf8Bytes("checkpoint-a")),
      authorizationCommitment: ethers.keccak256(ethers.toUtf8Bytes("auth-a")),
      timestamp: block.timestamp, nonce: 42
    };
    const domain = {
      name: "EchoAttestationRegistryV3", version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await registry.getAddress()
    };
    const types = { SignedCheckpoint: [
      {name:"account",type:"address"}, {name:"delegatee",type:"address"},
      {name:"zoneHash",type:"bytes32"}, {name:"checkpointCommitment",type:"bytes32"},
      {name:"authorizationCommitment",type:"bytes32"}, {name:"timestamp",type:"uint64"},
      {name:"nonce",type:"uint256"}
    ]};
    const sign = cp => validator.signTypedData(domain, types, cp);
    const signature = await sign(checkpoint);
    const digest = await registry.checkpointDigest(checkpoint);
    assert.equal(await registry.consumedCheckpoints(digest), false);
    await (await registry.connect(account).consumeCheckpoint(checkpoint, signature)).wait();
    assert.equal(await registry.consumedCheckpoints(digest), true);
    assert.equal(await registry.consumedCheckpointNonces(account.address, delegatee.address, 42), true);
    await assert.rejects(async () => {
      const tx = await registry.connect(account).consumeCheckpoint(checkpoint, signature);
      await tx.wait();
    });
    const changed = {...checkpoint, checkpointCommitment: ethers.keccak256(ethers.toUtf8Bytes("checkpoint-b"))};
    await assert.rejects(async () => {
      const tx = await registry.connect(account).consumeCheckpoint(changed, await sign(changed));
      await tx.wait();
    });
    assert.equal(await registry.consumedCheckpoints(await registry.checkpointDigest(changed)), false);
    assert.equal(await registry.consumedCheckpointNonces(account.address, delegatee.address, 42), true);
  });
});
