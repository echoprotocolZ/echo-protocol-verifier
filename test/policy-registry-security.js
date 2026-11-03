const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PolicyRegistry Security Regression Tests", function () {
  let registry, account, delegatee, admin, target;

  beforeEach(async function () {
    [account, delegatee, admin, target] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("PolicyRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  async function createPolicy() {
    const block = await ethers.provider.getBlock("latest");

    await registry.connect(account).setPolicy(delegatee.address, {
      isAllowed: true,
      expiryTimestamp: BigInt(block.timestamp) + 86400n,
      maxNativeSpendPerTx: ethers.parseEther("1"),
      dailyNativeSpendLimit: ethers.parseEther("5"),
      admin: admin.address
    });
  }

  it("must not reactivate old target and selector permissions after revocation", async function () {
    await createPolicy();

    await registry.connect(account).setTargetPolicy(
      delegatee.address,
      target.address,
      true
    );

    await registry.connect(account).setSelectorPolicy(
      delegatee.address,
      target.address,
      "0x12345678",
      true
    );

    await registry.connect(account).revokePolicy(delegatee.address);

    await createPolicy();

    expect(
      await registry.isSelectorAllowed(
        account.address,
        delegatee.address,
        target.address,
        "0x12345678"
      )
    ).to.equal(false);
  });
});

describe("PolicyRegistry Administrator Authorization", function () {
  it("allows a designated administrator to configure an account's target", async function () {
    const [account, delegatee, admin, target] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("PolicyRegistry");
    const registry = await Factory.deploy();
    await registry.waitForDeployment();

    const block = await ethers.provider.getBlock("latest");

    await registry.connect(account).setPolicy(delegatee.address, {
      isAllowed: true,
      expiryTimestamp: BigInt(block.timestamp) + 86400n,
      maxNativeSpendPerTx: ethers.parseEther("1"),
      dailyNativeSpendLimit: ethers.parseEther("5"),
      admin: admin.address
    });

    await registry.connect(admin).setTargetPolicyFor(
      account.address,
      delegatee.address,
      target.address,
      true
    );

    const result = await registry.targetPolicies(
      account.address,
      delegatee.address,
      target.address
    );

    expect(result).to.equal(true);
  });
});

describe("PolicyRegistry Unauthorized Administrator", function () {
  it("rejects an outsider changing another account's target permissions", async function () {
    const [account, delegatee, admin, target, outsider] =
      await ethers.getSigners();

    const Factory = await ethers.getContractFactory("PolicyRegistry");
    const registry = await Factory.deploy();
    await registry.waitForDeployment();

    const block = await ethers.provider.getBlock("latest");

    await registry.connect(account).setPolicy(delegatee.address, {
      isAllowed: true,
      expiryTimestamp: BigInt(block.timestamp) + 86400n,
      maxNativeSpendPerTx: ethers.parseEther("1"),
      dailyNativeSpendLimit: ethers.parseEther("5"),
      admin: admin.address
    });

    try {
      await registry.connect(outsider).setTargetPolicyFor(
        account.address,
        delegatee.address,
        target.address,
        true
      );

      expect.fail("Expected UnauthorizedAdmin, but transaction succeeded");
    } catch (error) {
      if (error.message.includes("Expected UnauthorizedAdmin")) {
        throw error;
      }
      expect(error.message).to.include("UnauthorizedAdmin");
    }
  });
});
