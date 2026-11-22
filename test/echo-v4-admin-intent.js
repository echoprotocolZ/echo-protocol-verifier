const { expect } = require("chai");
const { ethers } = require("hardhat");
const assert = require("node:assert/strict");

describe("ECHO V4 ownership administrative intent encoding", function () {
  let harness, account, successor, thirdParty;
  beforeEach(async function () {
    [account, successor, thirdParty] = await ethers.getSigners();
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
      { account: thirdParty.address },
      { successor: thirdParty.address },
      { chainId: 1n },
      { nonce: 1n },
      { deadline: 2000000001n }
    ]) {
      expect(await payload(change)).not.to.equal(original);
    }
  });

  it("rejects zero account, zero or self successor, and zero deadline", async function () {
    await assert.rejects(payload({ account: ethers.ZeroAddress }), /InvalidAccount/);
    await assert.rejects(payload({ successor: ethers.ZeroAddress }), /InvalidSuccessor/);
    await assert.rejects(payload({ successor: account.address }), /InvalidSuccessor/);
    await assert.rejects(payload({ deadline: 0n }), /InvalidDeadline/);
  });
});
