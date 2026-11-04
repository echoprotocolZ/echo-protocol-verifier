const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ECHO V4 Delegatee Permissions", function () {
  let bridge, owner, other, delegatee;

  beforeEach(async function () {
    [owner, other, delegatee] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory(
      "EchoDualProofTestMockV4"
    );
    const a = await Mock.deploy();
    const b = await Mock.deploy();
    await a.waitForDeployment();
    await b.waitForDeployment();

    const Bridge = await ethers.getContractFactory(
      "EchoAuthorizationBridgeV4"
    );
    bridge = await Bridge.deploy(
      await a.getAddress(),
      await b.getAddress()
    );
    await bridge.waitForDeployment();
  });

  it("authorizes a delegatee", async function () {
    await bridge.connect(owner).setAuthorizedDelegatee(
      delegatee.address, true
    );
    assert.equal(
      await bridge.authorizedDelegatees(
        owner.address, delegatee.address
      ),
      true
    );
  });

  it("revokes a delegatee", async function () {
    await bridge.connect(owner).setAuthorizedDelegatee(
      delegatee.address, true
    );
    await bridge.connect(owner).setAuthorizedDelegatee(
      delegatee.address, false
    );
    assert.equal(
      await bridge.authorizedDelegatees(
        owner.address, delegatee.address
      ),
      false
    );
  });

  it("keeps account permissions independent", async function () {
    await bridge.connect(owner).setAuthorizedDelegatee(
      delegatee.address, true
    );
    assert.equal(
      await bridge.authorizedDelegatees(
        other.address, delegatee.address
      ),
      false
    );
  });

  it("rejects the zero address", async function () {
    await assert.rejects(
      bridge.setAuthorizedDelegatee(
        ethers.ZeroAddress, true
      )
    );
  });
});
