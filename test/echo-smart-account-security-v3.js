const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Echo V3 smart account administrative security", function () {
  let owner, delegatee, outsider;
  let account, bridge, registry;

  const zeros = [0, 0];
  const zeroB = [[0, 0], [0, 0]];
  const signals = Array(20).fill(0);

  beforeEach(async function () {
    [owner, delegatee, outsider] = await ethers.getSigners();

    const Verifier = await ethers.getContractFactory("MockVerifier");
    const verifier = await Verifier.deploy();

    const Registry = await ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );
    registry = await Registry.deploy();

    const Bridge = await ethers.getContractFactory(
      "EchoAuthorizationBridgeV3"
    );
    bridge = await Bridge.deploy(verifier.target, registry.target);

    const Account = await ethers.getContractFactory(
      "EchoSmartAccountV3"
    );
    account = await Account.deploy(
      owner.address,
      ethers.ZeroAddress,
      bridge.target
    );
  });

  function checkpoint() {
    return {
      account: account.target,
      delegatee: delegatee.address,
      zoneHash: ethers.ZeroHash,
      checkpointCommitment: ethers.ZeroHash,
      authorizationCommitment: ethers.ZeroHash,
      timestamp: 0,
      nonce: 0
    };
  }

  function attempt(target, data = "0x") {
    return account.connect(delegatee).executeAuthorized.staticCall(
      checkpoint(),
      "0x",
      zeros,
      zeroB,
      zeros,
      signals,
      target,
      0,
      data
    );
  }


  async function expectUnauthorized(promise) {
    try {
      await promise;
      throw new Error("SECURITY FAILURE: Call was accepted");
    } catch (error) {
      if (error.message.includes("SECURITY FAILURE")) throw error;

      const data = error.data || error.info?.error?.data;
      if (!data) {
        throw new Error("Missing revert data: " + error.message);
      }

      const decoded = account.interface.parseError(data);

      if (!decoded || decoded.name !== "Unauthorized") {
        throw new Error("Expected Unauthorized, got: " + error.message);
      }
    }
  }

  it("blocks delegated calls to the bridge", async function () {
    await expectUnauthorized(attempt(bridge.target));
  });

  it("blocks delegated calls to the registry", async function () {
    await expectUnauthorized(attempt(registry.target));
  });

  it("rejects administration by non-owners", async function () {
    await expectUnauthorized(
      account.connect(delegatee).executeAdministration.staticCall(
        bridge.target,
        "0x"
      )
    );
  });

  it("allows owner administration of the registry", async function () {
    const data = registry.interface.encodeFunctionData(
      "setValidatorSigner",
      [outsider.address, true]
    );

    const tx = await account.connect(owner).executeAdministration(
      registry.target,
      data
    );

    const receipt = await tx.wait();

    expect(receipt.status).to.equal(1);

    const matchingEvents = receipt.logs
      .filter(log => log.address.toLowerCase() === registry.target.toLowerCase());

    expect(matchingEvents.length).to.be.greaterThan(0);

    expect(
      await registry.trustedValidatorSigners(
        account.target,
        outsider.address
      )
    ).to.equal(true);
  });
});
