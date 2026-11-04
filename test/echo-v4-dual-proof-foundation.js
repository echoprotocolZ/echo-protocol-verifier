const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO V4 Dual-Proof Foundation", function () {
  let dual, v3, v4, account, delegatee;
  let checkpoint, v3Signals, v4Signals;

  beforeEach(async function () {
    [account, delegatee] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory(
      "EchoDualProofTestMockV4"
    );

    v3 = await Mock.deploy();
    v4 = await Mock.deploy();

    await v3.waitForDeployment();
    await v4.waitForDeployment();

    const Dual = await ethers.getContractFactory(
      "EchoDualProofVerifierV4"
    );

    dual = await Dual.deploy(
      await v3.getAddress(),
      await v4.getAddress()
    );

    await dual.waitForDeployment();

    const zone = {
      minLat: 1200000000,
      maxLat: 1210000000,
      minLon: 2400000000,
      maxLon: 2410000000
    };

    const zoneDomain = ethers.keccak256(
      ethers.toUtf8Bytes("ECHO_V4_GEOGRAPHIC_ZONE_V1")
    );

    const zoneHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint32", "uint32", "uint32", "uint32"],
        [
          zoneDomain,
          zone.minLat,
          zone.maxLat,
          zone.minLon,
          zone.maxLon
        ]
      )
    );

    checkpoint = {
      account: account.address,
      delegatee: delegatee.address,
      zoneHash,
      checkpointCommitment: ethers.toBeHex(12345, 32),
      authorizationCommitment: ethers.ZeroHash,
      timestamp: 1000,
      nonce: 0
    };

    v3Signals = Array(20).fill(0n);
    v4Signals = Array(5).fill(0n);

    v3Signals[18] = 12345n;
    v4Signals[0] = BigInt(zone.minLat);
    v4Signals[1] = BigInt(zone.maxLat);
    v4Signals[2] = BigInt(zone.minLon);
    v4Signals[3] = BigInt(zone.maxLon);
    v4Signals[4] = 12345n;
  });

  function verify() {
    return dual.verifyDualProof(
      checkpoint,
      [0, 0],
      [[0, 0], [0, 0]],
      [0, 0],
      v3Signals,
      [0, 0],
      [[0, 0], [0, 0]],
      [0, 0],
      v4Signals
    );
  }

  it("accepts when both mock verifiers approve", async function () {
    assert.equal(await verify(), true);
  });

  it("rejects a mismatched V3 commitment", async function () {
    v3Signals[18] = 999n;
    await assert.rejects(verify(), /CheckpointMismatch/);
  });

  it("rejects a mismatched V4 commitment", async function () {
    v4Signals[4] = 999n;
    await assert.rejects(verify(), /CheckpointMismatch/);
  });

  it("rejects when V3 verification fails", async function () {
    await v3.setApproved(false);
    await assert.rejects(verify(), /InvalidV3Proof/);
  });

  it("rejects when V4 verification fails", async function () {
    await v4.setApproved(false);
    await assert.rejects(verify(), /InvalidV4Proof/);
  });

  it("rejects when both verifiers fail", async function () {
    await v3.setApproved(false);
    await v4.setApproved(false);
    await assert.rejects(verify());
  });
  it("rejects a signed-zone mismatch", async function () {
    checkpoint.zoneHash = ethers.ZeroHash;
    await assert.rejects(verify(), /SignedZoneMismatch/);
  });

  it("rejects oversized geographic signals", async function () {
    v4Signals[0] = 1800000001n;
    await assert.rejects(verify(), /GeographicSignalOutOfRange/);
  });

});
