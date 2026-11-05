const fs = require("fs");
const path = require("path");

const DIRECTORY = path.join(__dirname, "../deployments/amoy");
const FILE = path.join(DIRECTORY, "echo-v4.json");

function loadRecords() {
  if (!fs.existsSync(FILE)) {
    return {
      chainId: 80002,
      contracts: {}
    };
  }

  const records = JSON.parse(fs.readFileSync(FILE, "utf8"));

  if (records.chainId !== 80002) {
    throw new Error("Deployment record network mismatch");
  }

  if (!records.contracts || typeof records.contracts !== "object") {
    throw new Error("Invalid deployment records");
  }

  return records;
}

function saveRecords(records) {
  fs.mkdirSync(DIRECTORY, { recursive: true });

  const temporary = FILE + ".tmp";

  fs.writeFileSync(
    temporary,
    JSON.stringify(records, null, 2) + "\n",
    { mode: 0o600 }
  );

  fs.renameSync(temporary, FILE);
}

async function getExistingDeployment(provider, records, name) {
  const address = records.contracts[name];

  if (!address) return null;

  const code = await provider.getCode(address);

  if (code === "0x") {
    throw new Error(
      name + " has no deployed code at " + address
    );
  }

  const hre = require("hardhat");
  const artifact = await hre.artifacts.readArtifact(name);

  if (code.toLowerCase() !== artifact.deployedBytecode.toLowerCase()) {
    throw new Error(
      "Contract bytecode mismatch for " + name +
      " at " + address + ". Deployment stopped."
    );
  }

  console.log("REUSING:", name, address);
  return address;
}

module.exports = {
  loadRecords,
  saveRecords,
  getExistingDeployment
};
