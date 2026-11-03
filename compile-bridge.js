
const fs = require("fs");
const solc = require("solc");

const files = [
  "build/v2/EchoAuthorizationVerifierV2_Verifier.sol",
  "EchoAuthorizationBridgeV2.sol",
  "EchoSmartAccountV2.sol"
];

const sources = {};

for (const file of files) {
  sources[file] = {
    content: fs.readFileSync(file, "utf8")
  };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },
    viaIR: true,
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode"]
      }
    }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  for (const error of output.errors) {
    console.log(error.formattedMessage);
  }
}

const errors = (output.errors || []).filter(
  error => error.severity === "error"
);

if (errors.length > 0) {
  process.exit(1);
}

console.log("\nSUCCESS: All three main contracts compiled!");

for (const file of files) {
  for (const name of Object.keys(output.contracts[file])) {
    console.log("Compiled:", name);
  }
}
