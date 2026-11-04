const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO V4 Transaction Binding", function () {
  let harness, target, signals, callData;
  const value = 123n;
  const nonce = 7n;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    target = signers[1].address;
    callData = "0x12345678";

    const Mock = await ethers.getContractFactory(
      "EchoDualProofTestMockV4"
    );

    const a = await Mock.deploy();
    const b = await Mock.deploy();
    await a.waitForDeployment();
    await b.waitForDeployment();

    const Harness = await ethers.getContractFactory(
      "EchoAuthorizationBridgeV4TestHarness"
    );

    harness = await Harness.deploy(
      await a.getAddress(),
      await b.getAddress()
    );
    await harness.waitForDeployment();

    const network = await ethers.provider.getNetwork();
    const block = await ethers.provider.getBlock("latest");

    const hash = BigInt(ethers.keccak256(callData));
    const mask = (1n << 128n) - 1n;

    signals = Array(20).fill(0n);
    signals[6] = BigInt(target);
    signals[7] = value;
    signals[8] = hash & mask;
    signals[9] = hash >> 128n;
    signals[10] = network.chainId;
    signals[11] = nonce;
    signals[12] = BigInt(block.timestamp) + 3600n;
  });

  const validate = () =>
    harness.testValidateTransactionBinding(
      signals, target, value, callData, nonce
    );

  it("accepts matching transaction details", async function () {
    await validate();
  });

  it("rejects an incorrect chain ID", async function () {
    signals[10] += 1n;
    await assert.rejects(validate());
  });

  it("rejects an expired authorization", async function () {
    signals[12] = 1n;
    await assert.rejects(validate());
  });

  it("rejects an incorrect transaction target", async function () {
    signals[6] = 0n;
    await assert.rejects(validate());
  });

  it("rejects an incorrect transaction value", async function () {
    signals[7] += 1n;
    await assert.rejects(validate());
  });

  it("rejects an incorrect calldata hash", async function () {
    signals[8] += 1n;
    await assert.rejects(validate());
  });

  it("rejects an incorrect nonce", async function () {
    signals[11] += 1n;
    await assert.rejects(validate());
  });
});
