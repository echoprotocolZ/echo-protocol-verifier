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

describe("PolicyRegistry Token Administrator Security", function () {
  it("allows the designated administrator to set an account's token policy", async function () {
    const [account, delegatee, admin, token] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("PolicyRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const block = await ethers.provider.getBlock("latest");
    await registry.connect(account).setPolicy(delegatee.address, {
      isAllowed: true,
      expiryTimestamp: BigInt(block.timestamp) + 86400n,
      maxNativeSpendPerTx: 0n,
      dailyNativeSpendLimit: 0n,
      admin: admin.address
    });

    await registry.connect(admin).setTokenPolicyFor(
      account.address, delegatee.address, token.address,
      { maxSpendPerTx: 100n, dailySpendLimit: 500n, isAllowed: true }
    );

    const result = await registry.tokenPolicies(
      account.address, delegatee.address, token.address
    );
    expect(result.isAllowed).to.equal(true);
    expect(result.maxSpendPerTx).to.equal(100n);
    expect(result.dailySpendLimit).to.equal(500n);
  });

  it("rejects an unauthorized outsider", async function () {
    const [account, delegatee, admin, token, outsider] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("PolicyRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const block = await ethers.provider.getBlock("latest");
    await registry.connect(account).setPolicy(delegatee.address, {
      isAllowed: true,
      expiryTimestamp: BigInt(block.timestamp) + 86400n,
      maxNativeSpendPerTx: 0n,
      dailyNativeSpendLimit: 0n,
      admin: admin.address
    });

    let rejected = false;
    try {
      await registry.connect(outsider).setTokenPolicyFor(
        account.address, delegatee.address, token.address,
        { maxSpendPerTx: 100n, dailySpendLimit: 500n, isAllowed: true }
      );
    } catch (error) {
      rejected = error.message.includes("UnauthorizedAdmin");
    }
    expect(rejected).to.equal(true);
  });
});

describe("PolicyRegistry Selector Administrator Security", function () {
  const selector = "0xa9059cbb";

  async function setup() {
    const [account, delegatee, admin, target, outsider] =
      await ethers.getSigners();

    const Registry = await ethers.getContractFactory("PolicyRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const block = await ethers.provider.getBlock("latest");

    await registry.connect(account).setPolicy(delegatee.address, {
      isAllowed: true,
      expiryTimestamp: BigInt(block.timestamp) + 86400n,
      maxNativeSpendPerTx: 0n,
      dailyNativeSpendLimit: 0n,
      admin: admin.address
    });

    return { registry, account, delegatee, admin, target, outsider };
  }

  it("allows a designated administrator to approve a selector", async function () {
    const { registry, account, delegatee, admin, target } = await setup();

    await registry.connect(account).setTargetPolicyFor(
      account.address, delegatee.address, target.address, true
    );

    await registry.connect(admin).setSelectorPolicyFor(
      account.address, delegatee.address, target.address, selector, true
    );

    expect(
      await registry.isSelectorAllowed(
        account.address, delegatee.address, target.address, selector
      )
    ).to.equal(true);
  });

  it("rejects an unauthorized outsider changing selector permissions", async function () {
    const { registry, account, delegatee, target, outsider } = await setup();

    let rejected = false;

    try {
      await registry.connect(outsider).setSelectorPolicyFor(
        account.address, delegatee.address, target.address, selector, true
      );
    } catch (error) {
      rejected = error.message.includes("UnauthorizedAdmin");
    }

    expect(rejected).to.equal(true);
  });
});

describe("PolicyRegistry Account-Scoped Revocation Security", function () {
  async function setup() {
    const [account, delegatee, admin, target, outsider] =
      await ethers.getSigners();

    const Registry = await ethers.getContractFactory("PolicyRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const block = await ethers.provider.getBlock("latest");

    const policy = {
      isAllowed: true,
      expiryTimestamp: BigInt(block.timestamp) + 86400n,
      maxNativeSpendPerTx: 0n,
      dailyNativeSpendLimit: 0n,
      admin: admin.address
    };

    await registry.connect(account).setPolicy(delegatee.address, policy);

    return { registry, account, delegatee, admin, target, outsider, policy };
  }

  it("allows the designated administrator to revoke a delegation", async function () {
    const { registry, account, delegatee, admin } = await setup();

    await registry.connect(admin).revokePolicyFor(
      account.address, delegatee.address
    );

    const policy = await registry.policies(account.address, delegatee.address);
    expect(policy.isAllowed).to.equal(false);
  });

  it("rejects an outsider attempting to revoke a delegation", async function () {
    const { registry, account, delegatee, outsider } = await setup();

    let rejected = false;

    try {
      await registry.connect(outsider).revokePolicyFor(
        account.address, delegatee.address
      );
    } catch (error) {
      rejected = error.message.includes("UnauthorizedAdmin");
    }

    expect(rejected).to.equal(true);

    const policy = await registry.policies(account.address, delegatee.address);
    expect(policy.isAllowed).to.equal(true);
  });

  it("does not reactivate old target and selector permissions after regrant", async function () {
    const { registry, account, delegatee, admin, target, policy } = await setup();
    const selector = "0xa9059cbb";

    await registry.connect(account).setTargetPolicyFor(
      account.address, delegatee.address, target.address, true
    );

    await registry.connect(account).setSelectorPolicyFor(
      account.address, delegatee.address, target.address, selector, true
    );

    expect(await registry.isSelectorAllowed(
      account.address, delegatee.address, target.address, selector
    )).to.equal(true);

    await registry.connect(admin).revokePolicyFor(
      account.address, delegatee.address
    );

    await registry.connect(account).setPolicy(delegatee.address, policy);

    expect(await registry.isSelectorAllowed(
      account.address, delegatee.address, target.address, selector
    )).to.equal(false);
  });
});

describe("PolicyRegistry Policy Replacement Security", function () {
  it("invalidates old target and selector approvals when a policy is replaced", async function () {
    const [account, delegatee, admin, target] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("PolicyRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const block = await ethers.provider.getBlock("latest");

    const policy = {
      isAllowed: true,
      expiryTimestamp: BigInt(block.timestamp) + 86400n,
      maxNativeSpendPerTx: 0n,
      dailyNativeSpendLimit: 0n,
      admin: admin.address
    };

    await registry.connect(account).setPolicy(delegatee.address, policy);

    const selector = "0xa9059cbb";

    await registry.connect(account).setTargetPolicyFor(
      account.address, delegatee.address, target.address, true
    );

    await registry.connect(account).setSelectorPolicyFor(
      account.address, delegatee.address, target.address, selector, true
    );

    expect(await registry.isSelectorAllowed(
      account.address, delegatee.address, target.address, selector
    )).to.equal(true);

    await registry.connect(account).setPolicy(delegatee.address, policy);

    expect(await registry.isSelectorAllowed(
      account.address, delegatee.address, target.address, selector
    )).to.equal(false);
  });
});

describe("PolicyRegistry Token Generation Security", function () {
  it("rejects old token permissions after policy replacement", async function () {
    const [account, delegatee, admin, recipient] =
      await ethers.getSigners();

    const Registry = await ethers.getContractFactory("PolicyRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const block = await ethers.provider.getBlock("latest");
    const policy = {
      isAllowed: true,
      expiryTimestamp: BigInt(block.timestamp) + 86400n,
      maxNativeSpendPerTx: 0n,
      dailyNativeSpendLimit: 0n,
      admin: admin.address
    };

    const selector = "0xa9059cbb";
    const token = recipient.address;

    await registry.connect(account).setPolicy(delegatee.address, policy);

    await registry.connect(account).setTokenPolicyFor(
      account.address, delegatee.address, token,
      { maxSpendPerTx: 100n, dailySpendLimit: 500n, isAllowed: true }
    );

    await registry.connect(account).setTargetPolicyFor(
      account.address, delegatee.address, token, true
    );

    await registry.connect(account).setSelectorPolicyFor(
      account.address, delegatee.address, token, selector, true
    );

    // Replace the delegation without revoking it.
    await registry.connect(account).setPolicy(delegatee.address, policy);

    // Reapprove the target and selector, but NOT the token policy.
    await registry.connect(account).setTargetPolicyFor(
      account.address, delegatee.address, token, true
    );

    await registry.connect(account).setSelectorPolicyFor(
      account.address, delegatee.address, token, selector, true
    );

    const data = ethers.concat([
      selector,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256"], [recipient.address, 10n]
      )
    ]);

    let rejected = false;

    try {
      await registry.connect(account).validateExecution(
        account.address, delegatee.address, token, 0n, data
      );
    } catch (error) {
      rejected = error.message.includes("TokenNotAllowed");
    }

    expect(rejected).to.equal(true);
  });
});

describe("PolicyRegistry ERC20 Bypass Protection", function () {
  const blockedSelectors = [
    ["approve", "0x095ea7b3"],
    ["transferFrom", "0x23b872dd"],
    ["increaseAllowance", "0x39509351"]
  ];

  for (const [name, selector] of blockedSelectors) {
    it(`rejects ${name} even when explicitly allowlisted`, async function () {
      const [account, delegatee, admin, token, recipient] =
        await ethers.getSigners();

      const Registry = await ethers.getContractFactory("PolicyRegistry");
      const registry = await Registry.deploy();
      await registry.waitForDeployment();

      const block = await ethers.provider.getBlock("latest");

      await registry.connect(account).setPolicy(delegatee.address, {
        isAllowed: true,
        expiryTimestamp: BigInt(block.timestamp) + 86400n,
        maxNativeSpendPerTx: 0n,
        dailyNativeSpendLimit: 0n,
        admin: admin.address
      });

      await registry.connect(account).setTargetPolicyFor(
        account.address, delegatee.address, token.address, true
      );

      await registry.connect(account).setSelectorPolicyFor(
        account.address, delegatee.address, token.address, selector, true
      );

      const data = selector + "00".repeat(
        selector === "0x23b872dd" ? 96 : 64
      );

      let rejected = false;

      try {
        await registry.connect(account).validateExecution(
          account.address, delegatee.address, token.address, 0n, data
        );
      } catch (error) {
        rejected = error.message.includes("InvalidTokenCall");
      }

      expect(rejected).to.equal(true);
    });
  }
});
