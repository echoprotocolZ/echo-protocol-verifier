const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("Echo Protocol Z factory-only initialization", function () {
  it("rejects initialization by the owner and an outsider", async function () {
    const [owner, outsider, designatedFactory] =
      await ethers.getSigners();

    const registry = await (
      await ethers.getContractFactory("EchoAttestationRegistryV3")
    ).deploy();
    await registry.waitForDeployment();

    const account = await (
      await ethers.getContractFactory("EchoSmartAccountZ")
    ).deploy(
      owner.address,
      ethers.ZeroAddress,
      registry.target,
      designatedFactory.address
    );
    await account.waitForDeployment();

    const targets = [];
    const calls = [];

    for (const signer of [owner, outsider]) {
      await assert.rejects(
        async () => {
          const tx = await account.connect(signer).initialize(
            targets,
            calls
          );
          await tx.wait();
        },
        /OnlyDeploymentFactory/
      );
    }

    assert.equal(await account.initialized(), false);

    console.log("Owner initialization rejected.");
    console.log("Outsider initialization rejected.");
    console.log("Account remains uninitialized.");
  });
});
