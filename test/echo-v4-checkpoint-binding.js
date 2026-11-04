const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO V4 Checkpoint Binding", function () {
  let harness, checkpoint, signals;

  beforeEach(async function () {
    const [account, delegatee] = await ethers.getSigners();

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

    checkpoint = {
      account: account.address,
      delegatee: delegatee.address,
      zoneHash: ethers.ZeroHash,
      checkpointCommitment: ethers.toBeHex(12345, 32),
      authorizationCommitment: ethers.toBeHex(67890, 32),
      timestamp: 1000,
      nonce: 7
    };

    signals = Array(20).fill(0n);
    signals[1] = 67890n;
    signals[3] = BigInt(account.address);
    signals[4] = BigInt(delegatee.address);
    signals[11] = 7n;
    signals[16] = 900n;
    signals[17] = 1100n;
    signals[18] = 12345n;
    signals[19] = 1000n;
  });

  const validate = () =>
    harness.testValidateCheckpointBinding(checkpoint, signals);

  it("accepts a matching checkpoint", async function () {
    await validate();
  });

  const cases = [
    ["checkpoint commitment", 18],
    ["authorization commitment", 1],
    ["account", 3],
    ["delegatee", 4],
    ["nonce", 11],
    ["timestamp signal", 19]
  ];

  for (const [name, index] of cases) {
    it(`rejects a mismatched ${name}`, async function () {
      signals[index] += 1n;
      await assert.rejects(validate());
    });
  }

  it("rejects a timestamp below the permitted range", async function () {
    signals[16] = 1001n;
    await assert.rejects(validate());
  });

  it("rejects a timestamp above the permitted range", async function () {
    signals[17] = 999n;
    await assert.rejects(validate());
  });
});
