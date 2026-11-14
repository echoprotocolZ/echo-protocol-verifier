const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO V3 registry signed checkpoint security", function () {
  const types = { SignedCheckpoint: [
    { name: "account", type: "address" },
    { name: "delegatee", type: "address" },
    { name: "zoneHash", type: "bytes32" },
    { name: "checkpointCommitment", type: "bytes32" },
    { name: "authorizationCommitment", type: "bytes32" },
    { name: "timestamp", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ] };
  async function fixture() {
    const [account, delegatee, validator, outsider] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    await registry.waitForDeployment();
    const chain = await ethers.provider.getNetwork();
    const domain = {
      name: "EchoAttestationRegistryV3", version: "1",
      chainId: chain.chainId, verifyingContract: await registry.getAddress(),
    };
    const now = BigInt((await ethers.provider.getBlock("latest")).timestamp);
    const checkpoint = {
      account: account.address, delegatee: delegatee.address,
      zoneHash: ethers.keccak256(ethers.toUtf8Bytes("test-zone")),
      checkpointCommitment: ethers.toBeHex(123n, 32),
      authorizationCommitment: ethers.toBeHex(456n, 32),
      timestamp: now, nonce: 1n,
    };
    await (await registry.connect(account).setValidatorSigner(validator.address, true)).wait();
    await (await registry.connect(account).setAttestationPolicy(delegatee.address, {
      allowedZoneHash: checkpoint.zoneHash, maxTimeDrift: 3600n,
      requiredTier: 0, allowValidatorFallback: false, enabled: true,
    })).wait();
    const sign = (data, signer = validator, signingDomain = domain) =>
      signer.signTypedData(signingDomain, types, data);
    return { account, delegatee, validator, outsider, registry, domain, checkpoint, sign };
  }
  it("consumes a valid EIP-712 signed checkpoint exactly once", async () => {
    const f = await fixture();
    const signature = await f.sign(f.checkpoint);
    await (await f.registry.connect(f.account).consumeCheckpoint(f.checkpoint, signature)).wait();
    assert.equal(await f.registry.consumedCheckpointNonces(
      f.account.address, f.delegatee.address, 1n), true);
    await assert.rejects(f.registry.connect(f.account).consumeCheckpoint(f.checkpoint, signature));
  });
  it("rejects signatures for a different checkpoint timestamp", async () => {
    const f = await fixture();
    const signature = await f.sign({ ...f.checkpoint, timestamp: f.checkpoint.timestamp - 1n });
    await assert.rejects(f.registry.connect(f.account).consumeCheckpoint(f.checkpoint, signature));
  });
  it("rejects signatures for a different checkpoint commitment", async () => {
    const f = await fixture();
    const signature = await f.sign({ ...f.checkpoint, checkpointCommitment: ethers.toBeHex(999n, 32) });
    await assert.rejects(f.registry.connect(f.account).consumeCheckpoint(f.checkpoint, signature));
  });
  it("rejects signatures for a different chain ID", async () => {
    const f = await fixture();
    const signature = await f.sign(f.checkpoint, f.validator, { ...f.domain, chainId: f.domain.chainId + 1n });
    await assert.rejects(f.registry.connect(f.account).consumeCheckpoint(f.checkpoint, signature));
  });
  it("rejects signatures intended for another registry contract", async () => {
    const f = await fixture();
    const otherRegistry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    await otherRegistry.waitForDeployment();
    const signature = await f.sign(f.checkpoint, f.validator, {
      ...f.domain, verifyingContract: await otherRegistry.getAddress()
    });
    await assert.rejects(f.registry.connect(f.account).consumeCheckpoint(f.checkpoint, signature));
  });
  it("rejects authorization commitment substitution", async () => {
    const f = await fixture();
    const signature = await f.sign({
      ...f.checkpoint, authorizationCommitment: ethers.toBeHex(999n, 32)
    });
    await assert.rejects(f.registry.connect(f.account).consumeCheckpoint(f.checkpoint, signature));
  });
  it("rejects delegatee substitution", async () => {
    const f = await fixture();
    const signature = await f.sign({ ...f.checkpoint, delegatee: f.outsider.address });
    await assert.rejects(f.registry.connect(f.account).consumeCheckpoint(f.checkpoint, signature));
  });
  it("rejects signatures after validator trust is revoked", async () => {
    const f = await fixture();
    const signature = await f.sign(f.checkpoint);
    await (await f.registry.connect(f.account).setValidatorSigner(f.validator.address, false)).wait();
    await assert.rejects(f.registry.connect(f.account).consumeCheckpoint(f.checkpoint, signature));
  });
  it("rejects an untrusted validator", async () => {
    const f = await fixture();
    const signature = await f.sign(f.checkpoint, f.outsider);
    await assert.rejects(f.registry.connect(f.account).consumeCheckpoint(f.checkpoint, signature));
  });
  it("rejects consumption from a caller other than the account", async () => {
    const f = await fixture();
    const signature = await f.sign(f.checkpoint);
    await assert.rejects(f.registry.connect(f.outsider).consumeCheckpoint(f.checkpoint, signature));
  });
  it("rejects a second checkpoint using the same account/delegatee nonce", async () => {
    const f = await fixture();
    const first = await f.sign(f.checkpoint);
    await (await f.registry.connect(f.account).consumeCheckpoint(f.checkpoint, first)).wait();
    const secondCheckpoint = { ...f.checkpoint, checkpointCommitment: ethers.toBeHex(124n, 32) };
    const second = await f.sign(secondCheckpoint);
    await assert.rejects(f.registry.connect(f.account).consumeCheckpoint(secondCheckpoint, second));
  });
  it("rejects a signed checkpoint from an unauthorized zone", async () => {
    const f = await fixture();
    const other = { ...f.checkpoint, zoneHash: ethers.keccak256(ethers.toUtf8Bytes("other-zone")) };
    const signature = await f.sign(other);
    await assert.rejects(f.registry.connect(f.account).consumeCheckpoint(other, signature));
  });
});
