const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const network = await ethers.provider.getNetwork();

  if (network.chainId !== 31337n) {
    throw new Error("ECHO V3 deployment restricted to local Hardhat chain 31337");
  }

  const deploymentPath = "build/v3/deployment.json";

  if (fs.existsSync(deploymentPath)) {
    throw new Error(
      "Deployment record already exists. Refusing to overwrite: " + deploymentPath
    );
  }

  const [owner] = await ethers.getSigners();

  console.log("Deploying Echo Protocol V3...");
  console.log("Owner:", owner.address);

  const Verifier = await ethers.getContractFactory(
    "EchoAuthorizationVerifierV3"
  );
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();

  const Registry = await ethers.getContractFactory(
    "EchoAttestationRegistryV3"
  );
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  const Bridge = await ethers.getContractFactory(
    "EchoAuthorizationBridgeV3"
  );
  const bridge = await Bridge.deploy(
    await verifier.getAddress(),
    await registry.getAddress()
  );
  await bridge.waitForDeployment();

  const Account = await ethers.getContractFactory(
    "EchoSmartAccountV3"
  );
  const account = await Account.deploy(
    owner.address,
    ethers.ZeroAddress,
    await bridge.getAddress()
  );
  await account.waitForDeployment();

  const deployment = {
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    owner: owner.address,
    verifier: await verifier.getAddress(),
    registry: await registry.getAddress(),
    bridge: await bridge.getAddress(),
    smartAccount: await account.getAddress()
  };

  fs.writeFileSync(
    deploymentPath,
    JSON.stringify(deployment, null, 2),
    { flag: "wx" }
  );

  console.log("\nECHO V3 DEPLOYMENT COMPLETE");
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
