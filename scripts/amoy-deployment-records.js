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

  const names = await hre.artifacts.getAllFullyQualifiedNames();
  const matches = names.filter(n => n.endsWith(":" + name));

  if (matches.length !== 1) {
    throw new Error("Ambiguous contract name: " + name);
  }

  const info = await hre.artifacts.getBuildInfo(matches[0]);

  if (!info) {
    throw new Error("Missing compiler build information: " + name);
  }

  const [source, contractName] = matches[0].split(":");
  const compiled = info.output.contracts[source][contractName]
    .evm.deployedBytecode;

  const expected = compiled.object.toLowerCase();
  const actual = code.slice(2).toLowerCase();

  if (actual.length !== expected.length) {
    throw new Error("Contract bytecode length mismatch: " + name);
  }

  const masked = expected.split("");

  for (const entries of Object.values(
    compiled.immutableReferences || {}
  )) {
    for (const ref of entries) {
      const start = ref.start * 2;
      const end = start + ref.length * 2;

      for (let i = start; i < end; i++) {
        masked[i] = actual[i];
      }
    }
  }

  if (masked.join("") !== actual) {
    throw new Error(
      "Contract bytecode mismatch outside immutable references: " + name
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
