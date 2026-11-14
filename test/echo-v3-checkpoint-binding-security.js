const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO V3 checkpoint public-signal binding (real bridge)", function () {
  async function setup() {
    const [account, delegatee] = await ethers.getSigners();
    const verifier = await (await ethers.getContractFactory("EchoSecurityVerifierStub")).deploy();
    const registry = await (await ethers.getContractFactory("EchoSecurityRegistryStub")).deploy();
    await verifier.waitForDeployment();
    await registry.waitForDeployment();
    const bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV3"))
      .deploy(await verifier.getAddress(), await registry.getAddress());
    await bridge.waitForDeployment();
    const checkpoint = {
      account: account.address,
      delegatee: delegatee.address,
      zoneHash: ethers.ZeroHash,
      checkpointCommitment: ethers.toBeHex(123n, 32),
      authorizationCommitment: ethers.toBeHex(456n, 32),
      timestamp: 1700000000n,
      nonce: 7n,
    };
    const signals = Array(20).fill(0n);
    signals[1] = 456n;
    signals[3] = BigInt(account.address);
    signals[4] = BigInt(delegatee.address);
    signals[11] = 7n;
    signals[16] = 1699999999n;
    signals[17] = 1700000001n;
    signals[18] = 123n;
    signals[19] = 1700000000n;
    return { bridge, checkpoint, signals };
  }
  async function rejectsBinding(label, mutate) {
    const { bridge, checkpoint, signals } = await setup();
    mutate(checkpoint, signals);
    await assert.rejects(
      bridge.validateCheckpointBinding(checkpoint, signals),
      (err) => {
        assert.match(String(err), /CheckpointBindingMismatch|revert/i, label);
        return true;
      },
      label
    );
  }
  it("accepts exactly matching signed checkpoint and V3 public signals", async function () {
    const { bridge, checkpoint, signals } = await setup();
    assert.equal(await bridge.validateCheckpointBinding(checkpoint, signals), true);
  });
  it("rejects timestamp substitution inside the allowed window", async function () {
    await rejectsBinding("timestamp substitution", (c) => { c.timestamp += 1n; });
  });
  it("rejects checkpoint commitment substitution", async function () {
    await rejectsBinding("commitment substitution", (c) => {
      c.checkpointCommitment = ethers.toBeHex(124n, 32);
    });
  });
  it("rejects authorization commitment substitution", async function () {
    await rejectsBinding("authorization substitution", (c) => {
      c.authorizationCommitment = ethers.toBeHex(457n, 32);
    });
  });
  it("rejects account substitution", async function () {
    await rejectsBinding("account substitution", (c) => { c.account = ethers.ZeroAddress; });
  });
  it("rejects delegatee substitution", async function () {
    await rejectsBinding("delegatee substitution", (c) => { c.delegatee = ethers.ZeroAddress; });
  });
  it("rejects nonce substitution", async function () {
    await rejectsBinding("nonce substitution", (c) => { c.nonce += 1n; });
  });
  it("rejects timestamp outside allowed window", async function () {
    await rejectsBinding("time window", (c) => { c.timestamp = 1700000002n; });
  });
});
