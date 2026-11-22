const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

describe("ECHO real Groth16 verifier negative controls (local)", function () {
  it("rejects all-zero proof for V3 and V4 and preserves read-only behavior", async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    const v3 = await (await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
    const v4 = await (await ethers.getContractFactory("EchoGeographicBoundVerifierV4")).deploy();
    await Promise.all([v3.waitForDeployment(), v4.waitForDeployment()]);
    const a=[0n,0n],b=[[0n,0n],[0n,0n]],c=[0n,0n];
    assert.equal(await v3.verifyProof(a,b,c,Array(20).fill(0n)),false,
      "V3 accepted a zero proof");
    assert.equal(await v4.verifyProof(a,b,c,Array(5).fill(0n)),false,
      "V4 accepted a zero proof");
  });
});
