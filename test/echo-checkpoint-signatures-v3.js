const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Echo V3 checkpoint signer verification", function () {
  let registry, account, otherAccount, validator, hardware, outsider;
  let checkpoint;

  const types = {
    SignedCheckpoint: [
      { name: "account", type: "address" },
      { name: "delegatee", type: "address" },
      { name: "zoneHash", type: "bytes32" },
      { name: "checkpointCommitment", type: "bytes32" },
      { name: "authorizationCommitment", type: "bytes32" },
      { name: "timestamp", type: "uint64" },
      { name: "nonce", type: "uint256" }
    ]
  };

  beforeEach(async function () {
    [account, otherAccount, validator, hardware, outsider] =
      await ethers.getSigners();

    const Factory = await ethers.getContractFactory(
      "EchoAttestationRegistryV3"
    );

    registry = await Factory.deploy();
    await registry.waitForDeployment();

    checkpoint = {
      account: account.address,
      delegatee: outsider.address,
      zoneHash: ethers.id("zone-a"),
      checkpointCommitment: ethers.id("checkpoint-a"),
      authorizationCommitment: ethers.id("authorization-a"),
      timestamp: 1700000000n,
      nonce: 1n
    };
  });

  async function sign(signer, value = checkpoint) {
    const network = await ethers.provider.getNetwork();

    return signer.signTypedData(
      {
        name: "EchoAttestationRegistryV3",
        version: "1",
        chainId: network.chainId,
        verifyingContract: await registry.getAddress()
      },
      types,
      value
    );
  }

  async function expectRevert(promise) {
    let reverted = false;
    try {
      await promise;
    } catch (_) {
      reverted = true;
    }
    expect(reverted).to.equal(true);
  }

  it("accepts a trusted validator signature", async function () {
    await registry.connect(account).setValidatorSigner(
      validator.address, true
    );

    const signature = await sign(validator);

    expect(
      await registry.verifyCheckpointSigner(
        checkpoint, signature, 0
      )
    ).to.equal(validator.address);
  });

  it("rejects an untrusted signer", async function () {
    const signature = await sign(outsider);

    await expectRevert(
      registry.verifyCheckpointSigner(
        checkpoint, signature, 0
      )
    );
  });

  it("rejects a revoked signer", async function () {
    await registry.connect(account).setValidatorSigner(
      validator.address, true
    );

    const signature = await sign(validator);

    await registry.connect(account).setValidatorSigner(
      validator.address, false
    );

    await expectRevert(
      registry.verifyCheckpointSigner(
        checkpoint, signature, 0
      )
    );
  });

  it("isolates signer trust between accounts", async function () {
    await registry.connect(account).setValidatorSigner(
      validator.address, true
    );

    const otherCheckpoint = {
      ...checkpoint,
      account: otherAccount.address
    };

    const signature = await sign(
      validator, otherCheckpoint
    );

    await expectRevert(
      registry.verifyCheckpointSigner(
        otherCheckpoint, signature, 0
      )
    );
  });

  it("does not treat validators as hardware signers", async function () {
    await registry.connect(account).setValidatorSigner(
      validator.address, true
    );

    const signature = await sign(validator);

    await expectRevert(
      registry.verifyCheckpointSigner(
        checkpoint, signature, 1
      )
    );
  });

  it("accepts a registered hardware signer", async function () {
    await registry.connect(account).setHardwareSigner(
      hardware.address, true
    );

    const signature = await sign(hardware);

    expect(
      await registry.verifyCheckpointSigner(
        checkpoint, signature, 1
      )
    ).to.equal(hardware.address);
  });
});
