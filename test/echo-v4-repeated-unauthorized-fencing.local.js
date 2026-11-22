// Local-only adversarial regression. This is NOT a proof of bridge atomicity
// or rollback-anchor authenticity; those require authenticated fixtures.
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

describe("ECHO V4 repeated unauthorized administration fencing (local)", function () {
  it("rejects repeated and interleaved unauthorized mutations without state drift", async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    const [owner, outsider, recipient] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4"))
      .deploy(owner.address, ethers.ZeroAddress, registry.target);
    await account.waitForDeployment();
    const baseline = async () => ({
      owner: await account.owner(),
      pendingOwner: await account.pendingOwner(),
      entryPoint: await account.entryPoint(),
      nonce: await account.nonce()
    });
    const before = await baseline();
    const attempts = [
      () => account.connect(owner).transferOwnership(recipient.address),
      () => account.connect(outsider).transferOwnership(recipient.address),
      () => account.connect(owner).setEntryPoint(recipient.address),
      () => account.connect(outsider).setEntryPoint(recipient.address),
      () => account.connect(owner).acceptOwnership(),
      () => account.connect(owner).executeAdministration(recipient.address, "0x"),
      () => account.connect(owner).executeGeographicAdministration("0x")
    ];
    for (let round = 0; round < 2; round++) {
      for (const attempt of attempts) {
        await assert.rejects(async () => {
          const tx = await attempt();
          await tx.wait();
        }, "unauthorized operation must revert");
        assert.deepEqual(await baseline(), before, "state drift after rejected operation");
      }
    }
  });
});
