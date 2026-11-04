const { ethers } = require("hardhat");
const assert = require("node:assert/strict");

describe("Echo V2 local authorization tests", function () {
  let owner, validator, other;
  let verifier, registry, bridge, account, target;

  const proofA = [0, 0];
  const proofB = [[0, 0], [0, 0]];
  const proofC = [0, 0];

  async function makeSignals(overrides = {}) {
    const data = overrides.data ?? target.interface.encodeFunctionData(
      "setValue", [123]
    );

    const hash = BigInt(ethers.keccak256(data));
    const low = hash & ((1n << 128n) - 1n);
    const high = hash >> 128n;
    const network = await ethers.provider.getNetwork();
    const block = await ethers.provider.getBlock("latest");

    return {
      data,
      signals: [
        1n,
        2n,
        overrides.nullifier ?? 999n,
        BigInt(overrides.account ?? account.target),
        BigInt(overrides.validator ?? validator.address),
        BigInt(overrides.target ?? target.target),
        BigInt(overrides.value ?? 0),
        low,
        high,
        network.chainId,
        BigInt(overrides.nonce ?? 0),
        BigInt(overrides.deadline ?? (block.timestamp + 3600)),
        10n, 20n, 100n, 1n, 10000000000n
      ]
    };
  }

  async function expectFailure(promise, reason) {
    try {
      await promise;
      assert.fail("Expected transaction to fail");
    } catch (error) {
      if (error.message === "Expected transaction to fail") throw error;
      if (!error.message.includes(reason)) {
        throw new Error("Expected " + reason + ", got: " + error.message);
      }
    }
  }

  beforeEach(async function () {
    [owner, validator, other] = await ethers.getSigners();

    verifier = await (await ethers.getContractFactory("MockVerifierV2")).deploy();
    registry = await (await ethers.getContractFactory("MockRegistry")).deploy();

    await registry.setValidator(validator.address, true, true);

    bridge = await (
      await ethers.getContractFactory("EchoAuthorizationBridgeV2")
    ).deploy(verifier.target, registry.target);

    account = await (
      await ethers.getContractFactory("EchoSmartAccountV2")
    ).deploy(owner.address, ethers.ZeroAddress, bridge.target);

    target = await (
      await ethers.getContractFactory("TestTarget")
    ).deploy();
  });

  it("executes a valid authorization", async function () {
    const { signals, data } = await makeSignals();

    await account.executeAuthorized(
      proofA, proofB, proofC, signals, target.target, 0, data
    );

    assert.equal(await target.storedValue(), 123n);
    assert.equal(await account.nonce(), 1n);
    assert.equal(await bridge.consumedNullifiers(999n), true);
  });

  it("rejects the wrong account", async function () {
    const { signals, data } = await makeSignals({
      account: other.address
    });

    await expectFailure(
      account.executeAuthorized(
        proofA, proofB, proofC, signals, target.target, 0, data
      ),
      "NotAccountCaller"
    );
  });

  it("rejects altered transaction data", async function () {
    const { signals } = await makeSignals();
    const altered = target.interface.encodeFunctionData("setValue", [456]);

    await expectFailure(
      account.executeAuthorized(
        proofA, proofB, proofC, signals, target.target, 0, altered
      ),
      "InvalidTransaction"
    );
  });

  it("rejects expired authorization", async function () {
    const block = await ethers.provider.getBlock("latest");
    const { signals, data } = await makeSignals({
      deadline: block.timestamp - 100
    });

    await expectFailure(
      account.executeAuthorized(
        proofA, proofB, proofC, signals, target.target, 0, data
      ),
      "ExpiredAuthorization"
    );
  });

  it("rejects an ineligible validator", async function () {
    await registry.setValidator(validator.address, true, false);
    const { signals, data } = await makeSignals();

    await expectFailure(
      account.executeAuthorized(
        proofA, proofB, proofC, signals, target.target, 0, data
      ),
      "InvalidValidator"
    );
  });

  it("rejects replay of a consumed nullifier", async function () {
    const first = await makeSignals();

    await account.executeAuthorized(
      proofA, proofB, proofC, first.signals, target.target, 0, first.data
    );

    const second = await makeSignals({ nonce: 1, nullifier: 999n });

    await expectFailure(
      account.executeAuthorized(
        proofA, proofB, proofC, second.signals, target.target, 0, second.data
      ),
      "NullifierAlreadyUsed"
    );
  });

  it("rolls back nonce and nullifier after target failure", async function () {
    const data = target.interface.encodeFunctionData("fail");
    const { signals } = await makeSignals({ data, nullifier: 777n });

    await expectFailure(
      account.executeAuthorized(
        proofA, proofB, proofC, signals, target.target, 0, data
      ),
      "ExecutionFailed"
    );

    assert.equal(await account.nonce(), 0n);
    assert.equal(await bridge.consumedNullifiers(777n), false);
  });

  it("rejects when the verifier returns false", async function () {
    await verifier.setProofValid(false);
    const { signals, data } = await makeSignals();

    await expectFailure(
      account.executeAuthorized(
        proofA, proofB, proofC, signals, target.target, 0, data
      ),
      "InvalidProof"
    );
  });
});
