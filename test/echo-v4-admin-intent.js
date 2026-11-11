const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ECHO V4 ownership administrative intent encoding", function () {
  let harness, account, successor;
  beforeEach(async function () {
    [account, successor] = await ethers.getSigners();
    harness = await (await ethers.getContractFactory("EchoV4AdminIntentHarness")).deploy();
  });

  async function payload(overrides = {}) {
    const args = {
      account: account.address,
      successor: successor.address,
      chainId: 137n,
      nonce: 0n,
      deadline: 2000000000n,
      ...overrides
    };
    return harness.ownershipProposalPayload(
      args.account, args.successor, args.chainId, args.nonce, args.deadline
    );
  }

  it("is deterministic and encodes the expected operation domain and arguments", async function () {
    const expected = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
      [
        ethers.id("ECHO_V4_ADMIN_OWNERSHIP_PROPOSAL_V1"),
        account.address,
        successor.address,
        137n,
        0n,
        2000000000n
      ]
    );
    expect(await payload()).to.equal(expected);
    expect(await payload()).to.equal(await payload());
  });

  it("changes the payload when any replay-sensitive parameter changes", async function () {
    const original = await payload();
    for (const change of [
      { account: successor.address },
      { successor: account.address },
      { chainId: 1n },
      { nonce: 1n },
      { deadline: 2000000001n }
    ]) {
      expect(await payload(change)).not.to.equal(original);
    }
  });

  it("rejects zero account, zero or self successor, and zero deadline", async function () {
    await expect(payload({ account: ethers.ZeroAddress }))
      .to.be.revertedWithCustomError(harness, "InvalidAccount");
    await expect(payload({ successor: ethers.ZeroAddress }))
      .to.be.revertedWithCustomError(harness, "InvalidSuccessor");
    await expect(payload({ successor: account.address }))
      .to.be.revertedWithCustomError(harness, "InvalidSuccessor");
    await expect(payload({ deadline: 0n }))
      .to.be.revertedWithCustomError(harness, "InvalidDeadline");
  });
});
