const assert = require("node:assert/strict");
const fs = require("node:fs");
const { ethers } = require("hardhat");

describe("ECHO V4 Geographic Proof Gateway", function () {
  let gateway, registry, owner, delegatee, attacker;
  let proof, signals, args;

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
    proof = JSON.parse(fs.readFileSync(base + "valid-proof.json", "utf8"));
    signals = JSON.parse(
      fs.readFileSync(base + "valid-public.json", "utf8")
    ).map(BigInt);

    args = [
      proof.pi_a.slice(0, 2),
      [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]]
      ],
      proof.pi_c.slice(0, 2)
    ];

    await registry.connect(owner).setGeographicPolicy(
      delegatee.address,
      zone
    );
  });

  function verify(
    account = owner.address,
    delegate = delegatee.address,
    commitment = ethers.toBeHex(signals[4], 32),
    publicSignals = signals
  ) {
    return gateway.verifyApprovedGeographicProof(
      account,
      delegate,
      commitment,
      ...args,
      publicSignals
    );
  }

  it("accepts a valid proof with an approved zone", async function () {
    assert.equal(await verify(), true);
  });

  it("rejects a wrong checkpoint commitment", async function () {
    await assert.rejects(verify(
      owner.address,
      delegatee.address,
      ethers.ZeroHash
    ));
  });

  it("rejects an unapproved account", async function () {
    await assert.rejects(verify(
      attacker.address,
      delegatee.address
    ));
  });

  it("rejects an unapproved delegatee", async function () {
    await assert.rejects(verify(
      owner.address,
      attacker.address
    ));
  });

  it("rejects a disabled policy", async function () {
    await registry.connect(owner).disableGeographicPolicy(
      delegatee.address
    );
    await assert.rejects(verify());
  });

  it("rejects a changed approved zone", async function () {
    await registry.connect(owner).setGeographicPolicy(
      delegatee.address,
      { ...zone, maxLat: 1210000001 }
    );
    await assert.rejects(verify());
  });

  it("rejects an oversized latitude signal", async function () {
    const modified = [...signals];
    modified[0] = (1n << 32n) + signals[0];
    await assert.rejects(verify(
      owner.address,
      delegatee.address,
      ethers.toBeHex(signals[4], 32),
      modified
    ));
  });

  it("rejects an oversized longitude signal", async function () {
    const modified = [...signals];
    modified[2] = (1n << 32n) + signals[2];
    await assert.rejects(verify(
      owner.address,
      delegatee.address,
      ethers.toBeHex(signals[4], 32),
      modified
    ));
  });

  it("rejects tampered proof public inputs", async function () {
    const modified = [...signals];
    modified[4] += 1n;
    await assert.rejects(verify(
      owner.address,
      delegatee.address,
      ethers.toBeHex(modified[4], 32),
      modified
    ));
  });
});
