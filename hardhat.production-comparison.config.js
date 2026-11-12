/**
 * Isolated production-compiler comparison configuration.
 * Never use this config for the existing Hardhat regression suite.
 * PolygonScan screenshot: solc 0.8.24, optimizer enabled with 200 runs.
 * viaIR and evmVersion are NOT confirmed; this is a hypothesis, not reproduction.
 */
require("@nomicfoundation/hardhat-ethers");
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: false
    }
  },
  paths: {
    artifacts: "./artifacts-production-comparison",
    cache: "./cache-production-comparison"
  }
};
