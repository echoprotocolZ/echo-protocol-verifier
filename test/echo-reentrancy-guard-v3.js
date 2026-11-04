const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ECHO V3 execution guard regression", function () {
  it("installs the execution lock on executeAuthorized", async function () {
    const [owner] = await ethers.getSigners();

    const Verifier = await ethers.getContractFactory("MockVerifier");
    const verifier = await Verifier.deploy();

    const Registry = await ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );
    const registry = await Registry.deploy();

    const Bridge = await ethers.getContractFactory(
      "EchoAuthorizationBridgeV3"
    );
    const bridge = await Bridge.deploy(
      verifier.target,
      registry.target
    );

    const Account = await ethers.getContractFactory(
      "EchoSmartAccountV3"
    );
    const account = await Account.deploy(
      owner.address,
      ethers.ZeroAddress,
      bridge.target
    );

    expect(await account.nonce()).to.equal(0n);

    const source = require("fs").readFileSync(
      "contracts/EchoSmartAccountV3.sol",
      "utf8"
    );

    expect(source).to.include("modifier nonReentrantExecution()");
    expect(source).to.include("if (_executionLock != 0) revert Unauthorized()");
    expect(source).to.match(
      /onlyAuthorizedExecutionCaller\(checkpoint\)\s*nonReentrantExecution/
    );
  });

  it("rejects an invalid authorization before execution", async function () {
    const [owner] = await ethers.getSigners();

    const Verifier = await ethers.getContractFactory("MockVerifier");
    const verifier = await Verifier.deploy();

    const Registry = await ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );
    const registry = await Registry.deploy();

    const Bridge = await ethers.getContractFactory(
      "EchoAuthorizationBridgeV3"
    );
    const bridge = await Bridge.deploy(verifier.target, registry.target);

    const Account = await ethers.getContractFactory(
      "EchoSmartAccountV3"
    );
    const account = await Account.deploy(
      owner.address,
      ethers.ZeroAddress,
      bridge.target
    );

    const checkpoint = {
      account: account.target,
      delegatee: owner.address,
      zoneHash: ethers.ZeroHash,
      checkpointCommitment: ethers.ZeroHash,
      authorizationCommitment: ethers.ZeroHash,
      timestamp: 0,
      nonce: 0
    };

    const args = [
      checkpoint,
      "0x",
      [0, 0],
      [[0, 0], [0, 0]],
      [0, 0],
      Array(19).fill(0),
      owner.address,
      0,
      "0x"
    ];

    let rejected = false;

    try {
      await account.executeAuthorized.staticCall(...args);
    } catch (error) {
      rejected = true;
      console.log("Preliminary authorization rejection confirmed");
    }

    expect(rejected).to.equal(true);

    expect(await account.nonce()).to.equal(0n);
  });

});
