const hre = require("hardhat");

const CONNECTIONS = {
  EchoAuthorizationBridgeV3: [
    "verifier",
    "checkpointRegistry"
  ],
  EchoGeographicProofGatewayV4: [
    "verifier",
    "policyRegistry"
  ],
  EchoDualProofVerifierV4: [
    "v3Bridge",
    "v4Gateway"
  ],
  EchoAuthorizationBridgeV4: [
    "dualProofVerifier",
    "checkpointRegistry"
  ],
  EchoSmartAccountV4: [
    "owner",
    "entryPoint",
    "authorizationBridge"
  ]
};

async function verifyConnections(name, address, args = []) {
  const getters = CONNECTIONS[name] || [];

  if (getters.length !== args.length) {
    if (getters.length === 0 && args.length === 0) return;

    throw new Error(
      "Constructor connection count mismatch: " + name
    );
  }

  const contract = await hre.ethers.getContractAt(name, address);

  for (let i = 0; i < getters.length; i++) {
    const getter = getters[i];
    const actual = await contract[getter]();
    const expected = args[i];

    if (
      actual.toLowerCase() !== expected.toLowerCase()
    ) {
      throw new Error(
        "Connection mismatch: " + name + "." + getter +
        " expected " + expected + " but found " + actual
      );
    }
  }

  console.log("CONNECTIONS VERIFIED:", name);
}

module.exports = { verifyConnections };
