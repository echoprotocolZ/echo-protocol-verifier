const { ethers, network } = require("hardhat");
const assert = require("node:assert/strict");

describe("ECHO V4 account-to-bridge atomic rollback (mock authorization, local)", function () {
  it("reverts bridge consumption and nonce when downstream call fails; succeeds once on retry", async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    const [owner] = await ethers.getSigners();
    const bridge = await (await ethers.getContractFactory("EchoAtomicRollbackBridgeMock")).deploy();
    const target = await (await ethers.getContractFactory("EchoAtomicRollbackTargetMock")).deploy();
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4"))
      .deploy(owner.address, ethers.ZeroAddress, await bridge.getAddress());
    await Promise.all([bridge.waitForDeployment(), target.waitForDeployment(), account.waitForDeployment()]);
    const checkpoint = {
      account: await account.getAddress(), delegatee: owner.address,
      zoneHash: ethers.ZeroHash, checkpointCommitment: ethers.ZeroHash,
      authorizationCommitment: ethers.ZeroHash, timestamp: 0, nonce: 0
    };
    const a = [0, 0], b = [[0, 0], [0, 0]], s3 = Array(20).fill(0), s4 = Array(5).fill(0);
    const execute = async (data) => account.executeAuthorized(
      checkpoint, "0x", a, b, a, s3, a, b, a, s4, await target.getAddress(), 0, data
    );
    const failedCall = target.interface.encodeFunctionData("failAfterWrite");
    await assert.rejects(async () => {
      const tx = await execute(failedCall);
      await tx.wait();
    });
    assert.equal(await account.nonce(), 0n, "failed execution advanced account nonce");
    assert.equal(await bridge.consumed(), 0n, "failed execution retained bridge consumption");
    assert.equal(await target.calls(), 0n, "failed target retained state");

    const tx = await execute(target.interface.encodeFunctionData("succeed"));
    await tx.wait();
    assert.equal(await account.nonce(), 1n, "successful execution did not advance nonce");
    assert.equal(await bridge.consumed(), 1n, "successful execution did not consume authorization");
    assert.equal(await target.calls(), 1n, "successful target call missing");
  });
});
