const assert = require("node:assert/strict");
const hre = require("hardhat");

describe("Echo V4 Dual-Proof Bridge Integration", function () {
  let bridge, mock;

  const a = [0n, 0n];
  const b = [[0n, 0n], [0n, 0n]];
  const c = [0n, 0n];
  const v3Signals = Array(20).fill(0n);
  const v4Signals = Array(5).fill(0n);

  beforeEach(async function () {
    const [account] = await hre.ethers.getSigners();

    const Registry = await hre.ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Mock = await hre.ethers.getContractFactory(
      "EchoV4DualProofVerifierMock"
    );
    mock = await Mock.deploy();
    await mock.waitForDeployment();

    const Bridge = await hre.ethers.getContractFactory(
      "EchoAuthorizationBridgeV4TestHarness"
    );
    bridge = await Bridge.deploy(
      await mock.getAddress(),
      await registry.getAddress()
    );
    await bridge.waitForDeployment();

    this.checkpoint = {
      account: account.address,
      delegatee: account.address,
      zoneHash: hre.ethers.ZeroHash,
      checkpointCommitment: hre.ethers.ZeroHash,
      authorizationCommitment: hre.ethers.ZeroHash,
      timestamp: 0n,
      nonce: 1n
    };
  });

  function verify(bridge, checkpoint) {
    return bridge.exposedValidateDualProof(
      checkpoint,
      a, b, c, v3Signals,
      a, b, c, v4Signals
    );
  }

  it("accepts a true verifier result", async function () {
    await mock.setMode(0);
    await verify(bridge, this.checkpoint);
  });

  it("rejects a false verifier result", async function () {
    await mock.setMode(1);

    const selector = new hre.ethers.Interface([
      "error InvalidDualProof()"
    ]).getError("InvalidDualProof").selector;

    await assert.rejects(
      verify(bridge, this.checkpoint),
      (error) => {
        const data = error.data ??
          error.error?.data ??
          error.info?.error?.data;

        assert.equal(data?.slice(0, 10), selector);
        return true;
      }
    );
  });

  it("rejects a verifier revert", async function () {
    await mock.setMode(2);

    await assert.rejects(
      verify(bridge, this.checkpoint),
      /Mock verifier reverted/
    );
  });
});
