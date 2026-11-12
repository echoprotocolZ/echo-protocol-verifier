"use strict";
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("Echo V4 delegation administration safety", function () {
  it("cannot grant bridge delegatee permission by calling from the owner EOA", async function () {
    const [owner, delegatee] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const verifier = await (await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
    const v3Bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV3")).deploy(verifier.target, registry.target);
    const geoVerifier = await (await ethers.getContractFactory("EchoGeographicBoundVerifierV4")).deploy();
    const geoPolicy = await (await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")).deploy();
    const gateway = await (await ethers.getContractFactory("EchoGeographicProofGatewayV4")).deploy(geoVerifier.target, geoPolicy.target);
    const dual = await (await ethers.getContractFactory("EchoDualProofVerifierV4")).deploy(v3Bridge.target, gateway.target);
    const bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(dual.target, registry.target);
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4")).deploy(owner.address, ethers.ZeroAddress, bridge.target);

    assert.equal(await bridge.authorizedDelegatees(account.target, delegatee.address), false);
    await (await bridge.connect(owner).setAuthorizedDelegatee(delegatee.address, true)).wait();
    assert.equal(await bridge.authorizedDelegatees(owner.address, delegatee.address), true);
    assert.equal(await bridge.authorizedDelegatees(account.target, delegatee.address), false);

    const data = bridge.interface.encodeFunctionData("setAuthorizedDelegatee", [delegatee.address, true]);
    await assert.rejects(async () => {
      const tx = await account.connect(owner).executeAdministration(bridge.target, data);
      await tx.wait();
    }, (err) => {
      const revert = err.data || err.info?.error?.data;
      assert.equal(String(revert).slice(0, 10).toLowerCase(), account.interface.getError("Unauthorized").selector.toLowerCase());
      return true;
    });
    assert.equal(await bridge.authorizedDelegatees(account.target, delegatee.address), false);
  });
});
