const hre = require("hardhat");
const {
  loadRecords,
  saveRecords,
  getExistingDeployment
} = require("./amoy-deployment-records");
const {
  loadPending,
  savePending,
  recordTransaction,
  clearTransaction
} = require("./amoy-transaction-journal");

const NAME = "TestTarget";
const EXPECTED_WALLET =
  "0xbD2dEf17C60C3f6C2dA6eE812F948f4B53f2f803";

async function verifyTarget(address) {
  return getExistingDeployment(
    hre.ethers.provider,
    {
      chainId: 80002,
      contracts: { [NAME]: address }
    },
    NAME
  );
}

async function main() {
  if (hre.network.name !== "amoy") {
    throw new Error("Amoy network configuration required");
  }

  const network = await hre.ethers.provider.getNetwork();

  if (network.chainId !== 80002n) {
    throw new Error("Wrong network: Polygon Amoy required");
  }

  const records = loadRecords();
  const pending = loadPending();

  if (records.contracts[NAME] && pending[NAME]) {
    throw new Error("Conflicting deployment records and pending transaction");
  }

  if (records.contracts[NAME]) {
    await verifyTarget(records.contracts[NAME]);
    console.log("Existing TestTarget:", records.contracts[NAME]);
    console.log("No deployment needed.");
    return;
  }

  if (pending[NAME]) {
    if (pending[NAME] === "ATTEMPT_NOT_YET_RECONCILED") {
      throw new Error(
        "Unresolved deployment attempt. Inspect wallet history before retrying."
      );
    }

    const receipt = await hre.ethers.provider.getTransactionReceipt(
      pending[NAME]
    );

    if (!receipt) {
      throw new Error("Pending transaction unresolved: " + pending[NAME]);
    }

    if (receipt.status !== 1 || !receipt.contractAddress) {
      throw new Error("Deployment failed; manual reconciliation required");
    }

    await verifyTarget(receipt.contractAddress);

    records.contracts[NAME] = receipt.contractAddress;
    saveRecords(records);
    clearTransaction(NAME);

    console.log("RECOVERED TestTarget:", receipt.contractAddress);
    return;
  }

  if (process.env.CONFIRM_AMOY_DEPLOY !== "YES") {
    console.log("DRY RUN PASSED");
    console.log("Network: Polygon Amoy (80002)");
    console.log("Expected wallet:", EXPECTED_WALLET);
    console.log("TestTarget not yet recorded.");
    console.log("No transaction broadcast. No POL spent.");
    return;
  }

  const [deployer] = await hre.ethers.getSigners();

  if (!deployer ||
      deployer.address.toLowerCase() !== EXPECTED_WALLET.toLowerCase()) {
    throw new Error("Deployment wallet mismatch");
  }

  const balance = await hre.ethers.provider.getBalance(
    deployer.address
  );

  if (balance === 0n) {
    throw new Error("Wallet has no Amoy testnet POL");
  }

  const factory = await hre.ethers.getContractFactory(NAME);

  const deploymentRequest = await factory.getDeployTransaction();
  const gasEstimate = await hre.ethers.provider.estimateGas({
    ...deploymentRequest,
    from: deployer.address
  });

  console.log("Deploying TestTarget on Polygon Amoy");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "POL");
  console.log("Estimated deployment gas units:", gasEstimate.toString());

  recordTransaction(NAME, "ATTEMPT_NOT_YET_RECONCILED");

  const contract = await factory.deploy();
  const tx = contract.deploymentTransaction();

  if (!tx || !tx.hash) {
    throw new Error("Deployment attempt requires manual reconciliation");
  }

  savePending({
    ...loadPending(),
    [NAME]: tx.hash
  });

  console.log("Deployment transaction:", tx.hash);

  await contract.waitForDeployment();

  const receipt = await hre.ethers.provider.getTransactionReceipt(tx.hash);

  if (!receipt || receipt.status !== 1 || !receipt.contractAddress) {
    throw new Error("Deployment receipt requires manual reconciliation");
  }

  await verifyTarget(receipt.contractAddress);

  records.contracts[NAME] = receipt.contractAddress;
  saveRecords(records);
  clearTransaction(NAME);

  console.log("TESTTARGET DEPLOYMENT VERIFIED");
  console.log("Contract address:", receipt.contractAddress);
  console.log("Transaction:", tx.hash);
}

main().catch(error => {
  console.error("ERROR:", error.shortMessage || error.message);
  process.exitCode = 1;
});
