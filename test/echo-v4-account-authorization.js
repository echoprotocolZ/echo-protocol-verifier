
const assert = require("node:assert/strict");
const hre = require("hardhat");

describe("Echo V4 Account Authorization Security", function () {
  let account, outsider, delegatee, bridge;

  beforeEach(async function () {
    [account, outsider, delegatee] = await hre.ethers.getSigners();

    const Registry = await hre.ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Bridge = await hre.ethers.getContractFactory(
      "EchoAuthorizationBridgeV4TestHarness"
    );

    bridge = await Bridge.deploy(
      await registry.getAddress(),
      await registry.getAddress()
    );
    await bridge.waitForDeployment();
  });

  function checkpoint(delegateeAddress) {
    return {
      account: account.address,
      delegatee: delegateeAddress,
      zoneHash: hre.ethers.ZeroHash,
      checkpointCommitment: hre.ethers.ZeroHash,
      authorizationCommitment: hre.ethers.ZeroHash,
      timestamp: 0n,
      nonce: 1n
    };
  }

  async function expectCustomError(promise, name) {
    const selector = new hre.ethers.Interface([
      `error ${name}()`
    ]).getError(name).selector;

    await assert.rejects(promise, (error) => {
      const data =
        error.data ??
        error.error?.data ??
        error.info?.error?.data;

      assert.equal(
        data?.slice(0, 10),
        selector,
        `Expected ${name}`
      );

      return true;
    });
  }

  it("accepts the account authorizing itself", async function () {
    await bridge.connect(account)
      .exposedValidateAccountAuthorization(
        checkpoint(account.address)
      );
  });

  it("rejects an unauthorized caller", async function () {
    await expectCustomError(
      bridge.connect(outsider)
        .exposedValidateAccountAuthorization(
          checkpoint(account.address)
        ),
      "UnauthorizedAccount"
    );
  });

  it("rejects an unauthorized delegatee", async function () {
    await expectCustomError(
      bridge.connect(account)
        .exposedValidateAccountAuthorization(
          checkpoint(delegatee.address)
        ),
      "UnauthorizedDelegatee"
    );
  });

  it("accepts an explicitly authorized delegatee", async function () {
    await (
      await bridge.connect(account).setAuthorizedDelegatee(
        delegatee.address,
        true
      )
    ).wait();

    await bridge.connect(account)
      .exposedValidateAccountAuthorization(
        checkpoint(delegatee.address)
      );
  });
});
