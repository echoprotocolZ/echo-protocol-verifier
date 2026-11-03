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
