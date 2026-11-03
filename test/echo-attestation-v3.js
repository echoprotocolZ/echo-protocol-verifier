const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Echo V3 Attestation Policy Security", function () {
  let registry, account, delegatee, outsider;

  const zoneHash = ethers.keccak256(
    ethers.toUtf8Bytes("echo-test-zone")
  );

  beforeEach(async function () {
    [account, delegatee, outsider] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );

    registry = await Registry.deploy();
    await registry.waitForDeployment();
  });

  function policy(overrides = {}) {
    return {
      allowedZoneHash: zoneHash,
      maxTimeDrift: 300n,
      requiredTier: 2,
      allowValidatorFallback: false,
      enabled: true,
      ...overrides
    };
  }

  async function expectRejected(action, errorName) {
    let rejected = false;

    try {
      await action();
    } catch (error) {
      rejected = error.message.includes(errorName);
    }

    expect(rejected).to.equal(true);
  }

  it("allows an account to configure its own policy", async function () {
    await registry.connect(account).setAttestationPolicy(
      delegatee.address,
      policy()
    );

    const saved = await registry.attestationPolicies(
      account.address,
      delegatee.address
    );

    expect(saved.enabled).to.equal(true);
    expect(saved.requiredTier).to.equal(2n);
    expect(saved.maxTimeDrift).to.equal(300n);
  });

  it("isolates policies between accounts", async function () {
    await registry.connect(outsider).setAttestationPolicy(
      delegatee.address,
      policy({ requiredTier: 0 })
    );

    const accountPolicy = await registry.attestationPolicies(
      account.address,
      delegatee.address
    );

    expect(accountPolicy.enabled).to.equal(false);
  });

  it("rejects a missing geographic zone", async function () {
    await expectRejected(
      () => registry.connect(account).setAttestationPolicy(
        delegatee.address,
        policy({ allowedZoneHash: ethers.ZeroHash })
      ),
      "InvalidAttestationPolicy"
    );
  });

  it("rejects zero maximum time drift", async function () {
    await expectRejected(
      () => registry.connect(account).setAttestationPolicy(
        delegatee.address,
        policy({ maxTimeDrift: 0n })
      ),
      "InvalidAttestationPolicy"
    );
  });

  it("rejects validator fallback for HardwareStrict", async function () {
    await expectRejected(
      () => registry.connect(account).setAttestationPolicy(
        delegatee.address,
        policy({ allowValidatorFallback: true })
      ),
      "InvalidAttestationPolicy"
    );
  });

  it("rejects a zero delegatee address", async function () {
    await expectRejected(
      () => registry.connect(account).setAttestationPolicy(
        ethers.ZeroAddress,
        policy()
      ),
      "InvalidDelegatee"
    );
  });
});
