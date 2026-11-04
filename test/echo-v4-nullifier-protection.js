const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO V4 Nullifier Replay Protection", function () {
  let harness, account;

  beforeEach(async function () {
    [account] = await ethers.getSigners();

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
  });

  it("consumes a new nullifier", async function () {
    await harness.testConsumeNullifier(account.address, 123);

    assert.equal(await harness.consumedNullifiers(123), true);
  });

  it("rejects a reused nullifier", async function () {
    await harness.testConsumeNullifier(account.address, 123);

    await assert.rejects(
      harness.testConsumeNullifier(account.address, 123)
    );
  });

  it("rejects a zero nullifier", async function () {
    await assert.rejects(
      harness.testConsumeNullifier(account.address, 0)
    );
  });

  it("keeps different nullifiers independent", async function () {
    await harness.testConsumeNullifier(account.address, 123);
    await harness.testConsumeNullifier(account.address, 456);

    assert.equal(await harness.consumedNullifiers(123), true);
    assert.equal(await harness.consumedNullifiers(456), true);
    assert.equal(await harness.consumedNullifiers(789), false);
  });
});
