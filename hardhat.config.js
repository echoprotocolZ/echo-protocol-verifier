require("@nomicfoundation/hardhat-ethers")

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    amoy: {
      url: process.env.AMOY_RPC_URL || "https://polygon-amoy.drpc.org",
      chainId: 80002,
      accounts: process.env.AMOY_DEPLOYER_PRIVATE_KEY
        ? [process.env.AMOY_DEPLOYER_PRIVATE_KEY]
        : []
    }
  }
};
