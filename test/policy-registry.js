const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PolicyRegistry", function () {
  let registry;
  let account;
  let delegatee;
  let admin;
  let token;

  beforeEach(async function () {
    [account, delegatee, admin, token] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("PolicyRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  async function createPolicy(overrides = {}) {
    const block = await ethers.provider.getBlock("latest");

    await registry.connect(account).setPolicy(delegatee.address, {
      isAllowed: true,
      expiryTimestamp: BigInt(block.timestamp) + 86400n,
      maxNativeSpendPerTx: ethers.parseEther("1"),
      dailyNativeSpendLimit: ethers.parseEther("5"),
      admin: admin.address,
      ...overrides,
    });
  }

  async function expectCustomError(promise, errorName) {
    try {
      await promise;
      expect.fail(`Expected ${errorName}, but transaction succeeded`);
    } catch (error) {
      if (error.message.includes(`Expected ${errorName}`)) throw error;
      expect(error.message).to.include(errorName);
    }
  }

  it("creates an enabled delegation policy", async function () {
    await createPolicy();
    const policy = await registry.policies(account.address, delegatee.address);
    expect(policy.isAllowed).to.equal(true);
    expect(policy.admin).to.equal(admin.address);
  });

  it("allows an approved target and selector", async function () {
    await createPolicy();
    await registry.connect(account).setTargetPolicy(delegatee.address, token.address, true);
    await registry.connect(account).setSelectorPolicy(delegatee.address, token.address, "0xa9059cbb", true);

    expect(
      await registry.isSelectorAllowed(account.address, delegatee.address, token.address, "0xa9059cbb")
    ).to.equal(true);
  });

  it("rejects execution from an unauthorized caller", async function () {
    await createPolicy();
    await expectCustomError(
      registry.connect(delegatee).validateExecution(account.address, delegatee.address, token.address, 0, "0x12345678"),
      "UnauthorizedAccount"
    );
  });

  it("rejects a delegation that has not been enabled", async function () {
    await expectCustomError(
      registry.connect(account).validateExecution(account.address, delegatee.address, token.address, 0, "0x12345678"),
      "UnauthorizedDelegatee"
    );
  });

  it("rejects an unapproved target", async function () {
    await createPolicy();
    await expectCustomError(
      registry.connect(account).validateExecution(account.address, delegatee.address, token.address, 0, "0x12345678"),
      "TargetNotAllowed"
    );
  });

  it("rejects a native transfer above the per-transaction limit", async function () {
    await createPolicy();
    await registry.connect(account).setTargetPolicy(delegatee.address, token.address, true);
    await registry.connect(account).setSelectorPolicy(delegatee.address, token.address, "0x12345678", true);

    await expectCustomError(
      registry.connect(account).validateExecution(
        account.address, delegatee.address, token.address,
        ethers.parseEther("2"), "0x12345678"
      ),
      "TxLimitExceeded"
    );
  });

  it("revokes a delegation policy", async function () {
    await createPolicy();
    await registry.connect(account).revokePolicy(delegatee.address);
    const policy = await registry.policies(account.address, delegatee.address);
    expect(policy.isAllowed).to.equal(false);
  });

  it("rejects an expired policy", async function () {
    await createPolicy();
    await registry.connect(account).setTargetPolicy(delegatee.address, token.address, true);
    await registry.connect(account).setSelectorPolicy(delegatee.address, token.address, "0x12345678", true);

    await ethers.provider.send("evm_increaseTime", [86401]);
    await ethers.provider.send("evm_mine", []);

    await expectCustomError(
      registry.connect(account).validateExecution(
        account.address, delegatee.address, token.address, 0, "0x12345678"
      ),
      "PolicyExpired"
    );
  });
});

