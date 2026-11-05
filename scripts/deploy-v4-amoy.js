const hre = require("hardhat");
const {
  loadPending,
  recordTransaction,
  clearTransaction
} = require("./amoy-transaction-journal");

const {
  loadRecords,
  saveRecords,
  getExistingDeployment
} = require("./amoy-deployment-records");


const EXPECTED_CHAIN_ID = 80002n;
const EXPECTED_DEPLOYER =
  "0xbD2dEf17C60C3f6C2dA6eE812F948f4B53f2f803";

async function main() {
  const network = await hre.ethers.provider.getNetwork();

  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error("Wrong network. Polygon Amoy required.");
  }

  if (process.env.CONFIRM_AMOY_DEPLOY !== "YES") {
    console.log("DRY RUN — Polygon Amoy network verified.");
    console.log("Expected deployer:", EXPECTED_DEPLOYER);
    console.log("No contracts deployed. No POL spent.");
    return;
  }

  const [deployer] = await hre.ethers.getSigners();

  if (!deployer) {
    throw new Error("Deployment wallet not configured.");
  }

  if (deployer.address.toLowerCase() !==
      EXPECTED_DEPLOYER.toLowerCase()) {
    throw new Error("Deployment wallet address mismatch.");
  }

  console.log("Echo Protocol Z V4");
  console.log("Network:", network.chainId.toString());
  console.log("Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(
    deployer.address
  );

  console.log("Balance:", hre.ethers.formatEther(balance), "POL");

  if (process.env.CONFIRM_AMOY_DEPLOY !== "YES") {
    console.log("DRY RUN ONLY — no contracts deployed.");
    return;
  }

  if (balance === 0n) {
    throw new Error("Wallet needs Amoy testnet POL.");
  }

  const records = loadRecords();

  async function deploy(name, args = []) {
    const existing = await getExistingDeployment(
      hre.ethers.provider,
      records,
      name
    );

    const pending = loadPending();

    if (existing) {
      if (pending[name]) {
        throw new Error(
          "Conflicting saved deployment and pending transaction: " + name
        );
      }
      return hre.ethers.getContractAt(name, existing);
    }

    if (pending[name]) {
      console.log("RECOVERING:", name, pending[name]);

      const receipt = await hre.ethers.provider.getTransactionReceipt(
        pending[name]
      );

      if (!receipt) {
        throw new Error(
          "Transaction is pending or unavailable. Do not redeploy: " +
          pending[name]
        );
      }

      if (receipt.status !== 1 || !receipt.contractAddress) {
        throw new Error(
          "Deployment transaction failed or has no contract address: " +
          pending[name]
        );
      }

      const code = await hre.ethers.provider.getCode(
        receipt.contractAddress
      );

      if (code === "0x") {
        throw new Error("Recovered deployment has no code: " + name);
      }

      const artifact = await hre.artifacts.readArtifact(name);

      if (
        code.toLowerCase() !==
        artifact.deployedBytecode.toLowerCase()
      ) {
        throw new Error(
          "Recovered contract bytecode mismatch: " + name
        );
      }

      records.contracts[name] = receipt.contractAddress;
      saveRecords(records);
      clearTransaction(name);

      console.log("RECOVERED:", name, receipt.contractAddress);

      return hre.ethers.getContractAt(
        name,
        receipt.contractAddress
      );
    }

    console.log("Deploying:", name);

    const factory = await hre.ethers.getContractFactory(name);
    const contract = await factory.deploy(...args);
    const tx = contract.deploymentTransaction();

    recordTransaction(name, tx.hash);
    console.log("Transaction:", tx.hash);

    await contract.waitForDeployment();

    const address = await contract.getAddress();
    const code = await hre.ethers.provider.getCode(address);

    if (code === "0x") {
      throw new Error("No contract code found: " + name);
    }

    const artifact = await hre.artifacts.readArtifact(name);

    if (
      code.toLowerCase() !==
      artifact.deployedBytecode.toLowerCase()
    ) {
      throw new Error("Deployed bytecode mismatch: " + name);
    }

    records.contracts[name] = address;
    saveRecords(records);
    clearTransaction(name);

    console.log("SAVED:", name, address);

    return contract;
  }

  const registry = await deploy("EchoAttestationRegistryV3");
  const verifierV3 = await deploy("EchoAuthorizationVerifierV3");

  const bridgeV3 = await deploy("EchoAuthorizationBridgeV3", [
    await verifierV3.getAddress(),
    await registry.getAddress()
  ]);

  const policy = await deploy("EchoGeographicPolicyRegistryV4");
  const verifierV4 = await deploy("EchoGeographicBoundVerifierV4");

  const gateway = await deploy("EchoGeographicProofGatewayV4", [
    await verifierV4.getAddress(),
    await policy.getAddress()
  ]);

  const dualVerifier = await deploy("EchoDualProofVerifierV4", [
    await bridgeV3.getAddress(),
    await gateway.getAddress()
  ]);

  const bridgeV4 = await deploy("EchoAuthorizationBridgeV4", [
    await dualVerifier.getAddress(),
    await registry.getAddress()
  ]);

  const account = await deploy("EchoSmartAccountV4", [
    deployer.address,
    hre.ethers.ZeroAddress,
    await bridgeV4.getAddress()
  ]);

  console.log("V4 contract deployment transactions completed.");
  console.log("Smart account:", await account.getAddress());
  console.log("NEXT: Configure permissions and validate proofs.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
