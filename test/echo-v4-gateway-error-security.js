const assert = require("node:assert/strict");
const fs = require("node:fs");
const { ethers } = require("hardhat");

describe("ECHO V4 Gateway Exact Security Errors", function () {
  let gateway, registry, owner, delegatee, attacker;
  let signals, proofArgs;

  const zone = {
    minLat: 1200000000,
    maxLat: 1210000000,
    minLon: 2400000000,
    maxLon: 2410000000
  };

  beforeEach(async function () {
    [owner, delegatee, attacker] = await ethers.getSigners();

    const Verifier = await ethers.getContractFactory(
      "EchoGeographicBoundVerifierV4"
    );
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    const Registry = await ethers.getContractFactory(
      "EchoGeographicPolicyRegistryV4"
    );
    registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Gateway = await ethers.getContractFactory(
      "EchoGeographicProofGatewayV4"
    );
    gateway = await Gateway.deploy(
      await verifier.getAddress(),
      await registry.getAddress()
    );
    await gateway.waitForDeployment();

    const base = "build/v4-geographic-bound/proofs/";
    const proof = JSON.parse(
      fs.readFileSync(base + "valid-proof.json", "utf8")
    );
    signals = JSON.parse(
      fs.readFileSync(base + "valid-public.json", "utf8")
    ).map(BigInt);

    proofArgs = [
      proof.pi_a.slice(0, 2),
      [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]]
      ],
      proof.pi_c.slice(0, 2)
    ];

    await registry.connect(owner).setGeographicPolicy(
      delegatee.address, zone
    );
  });

  function verify(
    account = owner.address,
    delegate = delegatee.address,
    commitment = ethers.toBeHex(signals[4], 32),
    publicSignals = signals
  ) {
    return gateway.verifyApprovedGeographicProof(
      account, delegate, commitment,
      ...proofArgs, publicSignals
    );
  }

  async function expectCustomError(promise, contract, errorName) {
    try {
      await promise;
      assert.fail(`Expected ${errorName} revert`);
    } catch (error) {
      const data =
        error.data ??
        error.error?.data ??
        error.info?.error?.data;

      if (!data) throw error;

      const decoded = contract.interface.parseError(data);
      assert.ok(decoded, "Could not decode revert");
      assert.equal(decoded.name, errorName);
    }
  }

  it("rejects incorrect checkpoint commitment", async function () {
    await expectCustomError(
      verify(owner.address, delegatee.address, ethers.ZeroHash),
      gateway,
      "CheckpointCommitmentMismatch"
    );
  });

  it("rejects an unregistered account", async function () {
    await expectCustomError(
      verify(attacker.address),
      registry,
      "GeographicPolicyDisabled"
    );
  });

  it("rejects an unapproved delegatee", async function () {
    await expectCustomError(
      verify(owner.address, attacker.address),
      registry,
      "GeographicPolicyDisabled"
    );
  });

  it("rejects a disabled policy", async function () {
    await registry.connect(owner).disableGeographicPolicy(
      delegatee.address
    );

    await expectCustomError(
      verify(),
      registry,
      "GeographicPolicyDisabled"
    );
  });

  it("rejects a mismatched approved zone", async function () {
    await registry.connect(owner).setGeographicPolicy(
      delegatee.address,
      { ...zone, maxLat: 1210000001 }
    );

    await expectCustomError(
      verify(),
      registry,
      "GeographicZoneMismatch"
    );
  });

  it("rejects oversized latitude", async function () {
    const modified = [...signals];
    modified[0] = (1n << 32n) + signals[0];

    await expectCustomError(
      verify(
        owner.address,
        delegatee.address,
        ethers.toBeHex(signals[4], 32),
        modified
      ),
      gateway,
      "GeographicSignalOutOfRange"
    );
  });

  it("rejects oversized longitude", async function () {
    const modified = [...signals];
    modified[2] = (1n << 32n) + signals[2];

    await expectCustomError(
      verify(
        owner.address,
        delegatee.address,
        ethers.toBeHex(signals[4], 32),
        modified
      ),
      gateway,
      "GeographicSignalOutOfRange"
    );
  });

  it("rejects altered proof inputs at verifier", async function () {
    const modified = [...signals];
    modified[4] += 1n;

    await expectCustomError(
      verify(
        owner.address,
        delegatee.address,
        ethers.toBeHex(modified[4], 32),
        modified
      ),
      gateway,
      "InvalidGeographicProof"
    );
  });
});
