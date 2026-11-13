
async function expectCustomError(promise, contract, errorName) {
  const assert = require("node:assert/strict");
  const expected = contract.interface.getError(errorName);

  assert.ok(expected, `Unknown custom error: ${errorName}`);

  await assert.rejects(
    async () => await promise,
    (err) => {
      const data =
        err.data?.data ??
        err.data ??
        err.error?.data ??
        err.info?.error?.data;

      assert.equal(
        typeof data,
        "string",
        "Revert data missing"
      );

      assert.equal(
        data.slice(0, 10).toLowerCase(),
        expected.selector.toLowerCase(),
        `Expected ${errorName}`
      );

      return true;
    }
  );
}

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Echo Protocol Z V4 dual-proof binding regression", function () {
  const ZERO = ethers.ZeroHash;
  const A = [0n, 0n];
  const B = [[0n, 0n], [0n, 0n]];
  const C = [0n, 0n];
  const ZONE_DOMAIN = ethers.id("ECHO_V4_GEOGRAPHIC_ZONE_V1");
  const coder = ethers.AbiCoder.defaultAbiCoder();

  let dual, v3, v4, checkpoint, s3, s4;

  function zoneHash(bounds) {
    return ethers.keccak256(coder.encode(
      ["bytes32", "uint32", "uint32", "uint32", "uint32"],
      [ZONE_DOMAIN, ...bounds]
    ));
  }

  function args(cp = checkpoint, p3 = s3, p4 = s4) {
    return [cp, A, B, C, p3, A, B, C, p4];
  }

  beforeEach(async function () {
    const [owner, delegatee] = await ethers.getSigners();
    v3 = await (await ethers.getContractFactory("EchoV3CheckpointMock")).deploy();
    v4 = await (await ethers.getContractFactory("EchoV4GeographicMock")).deploy();
    await v3.waitForDeployment();
    await v4.waitForDeployment();
    dual = await (await ethers.getContractFactory("EchoDualProofVerifierV4")).deploy(
      await v3.getAddress(), await v4.getAddress()
    );
    await dual.waitForDeployment();

    const commitment = ethers.zeroPadValue("0x1234", 32);
    const bounds = [100050n, 100050n, 200000n, 200000n];
    checkpoint = {
      account: owner.address,
      delegatee: delegatee.address,
      zoneHash: zoneHash(bounds),
      checkpointCommitment: commitment,
      authorizationCommitment: ZERO,
      timestamp: 1793736906n,
      nonce: 0n
    };
    s3 = Array(20).fill(0n);
    s3[18] = BigInt(commitment);
    s4 = [...bounds, BigInt(commitment)];
  });

  it("accepts matching checkpoints and signed geographic bounds when both dependencies accept", async function () {
    expect(await dual.verifyDualProof(...args())).to.equal(true);
  });

  it("rejects a mismatched V3 checkpoint commitment", async function () {
    const altered = [...s3];
    altered[18] += 1n;
    await expectCustomError(dual.verifyDualProof(...args(checkpoint, altered, s4)), dual, "CheckpointMismatch");
  });

  it("rejects a mismatched V4 checkpoint commitment", async function () {
    const altered = [...s4];
    altered[4] += 1n;
    await expectCustomError(dual.verifyDualProof(...args(checkpoint, s3, altered)), dual, "CheckpointMismatch");
  });

  it("rejects an incorrect checkpoint commitment supplied in the checkpoint", async function () {
    const altered = { ...checkpoint, checkpointCommitment: ethers.zeroPadValue("0x9999", 32) };
    await expectCustomError(dual.verifyDualProof(...args(altered, s3, s4)), dual, "CheckpointMismatch");
  });

  it("rejects a geographic zone different from the signed zone", async function () {
    const altered = [...s4];
    altered[0] -= 1n;
    await expectCustomError(dual.verifyDualProof(...args(checkpoint, s3, altered)), dual, "SignedZoneMismatch");
  });

  it("rejects out-of-range geographic signals before uint32 conversion", async function () {
    const altered = [...s4];
    altered[0] = 1800000001n;
    await expectCustomError(dual.verifyDualProof(...args(checkpoint, s3, altered)), dual, "GeographicSignalOutOfRange");
  });

  it("rejects inverted geographic bounds", async function () {
    const altered = [...s4];
    altered[0] = 100051n;
    await expectCustomError(dual.verifyDualProof(...args(checkpoint, s3, altered)), dual, "InvalidZoneBoundaries");
  });

  it("rejects when the V3 dependency returns false", async function () {
    await (await v3.setResult(false)).wait();
    await expectCustomError(dual.verifyDualProof(...args()), dual, "InvalidV3Proof");
  });

  it("rejects when the V4 dependency returns false", async function () {
    await (await v4.setResult(false)).wait();
    await expectCustomError(dual.verifyDualProof(...args()), dual, "InvalidV4Proof");
  });

  it("rejects zero-address verifier dependencies", async function () {
    const factory = await ethers.getContractFactory("EchoDualProofVerifierV4");
    await expectCustomError(factory.deploy(ethers.ZeroAddress, await v4.getAddress()), factory, "InvalidDependency");
  });
});
