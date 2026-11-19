const { expect } = require("chai");
const assert = require("node:assert/strict");

async function rejectsCustomError(promise, errorName) {
  await assert.rejects(promise, err => {
    assert.ok(String(err.message).includes(errorName), `Expected ${errorName}, got: ${err.message}`);
    return true;
  });
}
const { ethers } = require("hardhat");

describe("Echo bootstrap proof gate V1 read-only boundary", function () {
  async function fixture() {
    const [owner, outsider] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const stub = await (await ethers.getContractFactory("EchoBootstrapVerifierStub")).deploy(true);
    const root = 123456n;
    const gate = await (await ethers.getContractFactory("EchoBootstrapProofGateV1")).deploy(
      owner.address, await registry.getAddress(), await stub.getAddress(), root
    );
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const statement = [root, BigInt(owner.address), chainId, 0n, 42n, 777n];
    const a = [0n, 0n], b = [[0n, 0n], [0n, 0n]], c = [0n, 0n];
    return { owner, outsider, registry, stub, gate, statement, a, b, c };
  }

  it("accepts matching pinned statement only when the stub reports success", async function () {
    const { gate, statement, a, b, c } = await fixture();
    expect(await gate.verifyBootstrapProof(a, b, c, statement)).to.equal(true);
  });

  it("rejects substituted enrollment roots", async function () {
    const { gate, statement, a, b, c } = await fixture();
    statement[0] += 1n;
    await rejectsCustomError(gate.verifyBootstrapProof(a, b, c, statement), "WrongStatement");
  });

  it("rejects cross-account and cross-chain statements", async function () {
    const { gate, statement, a, b, c } = await fixture();
    for (const i of [1, 2]) {
      const altered = [...statement];
      altered[i] += 1n;
      await rejectsCustomError(gate.verifyBootstrapProof(a, b, c, altered), "WrongStatement");
    }
  });

  it("rejects verifier refusal without changing registry state", async function () {
    const { gate, stub, registry, owner, outsider, statement, a, b, c } = await fixture();
    await stub.setAccept(false);
    await rejectsCustomError(gate.verifyBootstrapProof(a, b, c, statement), "ProofRejected");
    expect(await registry.authorizedCheckpointBridges(owner.address, outsider.address)).to.equal(false);
  });

  it("cannot bootstrap registry permissions by calling the read-only gate", async function () {
    const { gate, registry, owner, outsider, statement, a, b, c } = await fixture();
    await gate.connect(outsider).verifyBootstrapProof(a, b, c, statement);
    expect(await registry.trustedValidatorSigners(owner.address, outsider.address)).to.equal(false);
    expect(await registry.authorizedCheckpointBridges(owner.address, outsider.address)).to.equal(false);
  });
});
