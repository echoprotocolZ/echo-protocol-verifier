#!/usr/bin/env node
/**
 * Compare the isolated Solidity 0.8.24 fixture artifact with live Polygon staking runtime.
 * Read-only. Does not broadcast transactions.
 * Usage:
 * POLYGON_RPC_URL=https://polygon-bor-rpc.publicnode.com node scripts/compare-production-staking-artifact.js
 */
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const STAKING = "0x11bddDCE9770687675Afdef5AA9F001fcC837E4B";
const TOKEN = "0x9511Ee84398B8Deb725d8967c16693C96C43e0eD";
const artifactPath = path.resolve(__dirname, "../artifacts-production-comparison/contracts/EchoStakingSourceFixture.sol/EchoStakingSourceFixture.json");

async function main() {
  const url = process.env.POLYGON_RPC_URL;
  if (!url || !/^https?:\/\//i.test(url)) throw new Error("Set POLYGON_RPC_URL to an http(s) Polygon mainnet RPC endpoint");
  if (!fs.existsSync(artifactPath)) throw new Error("Comparison artifact missing. Run: npx hardhat compile --config hardhat.production-comparison.config.js --force");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const fixtureRuntime = artifact.deployedBytecode;
  if (!fixtureRuntime || fixtureRuntime === "0x") throw new Error("Comparison artifact has no deployed bytecode");
  const provider = new ethers.JsonRpcProvider(url);
  const network = await provider.getNetwork();
  if (network.chainId !== 137n) throw new Error("Wrong network; expected Polygon mainnet chain ID 137");
  const liveRuntime = await provider.getCode(STAKING);
  if (liveRuntime === "0x") throw new Error("No deployed staking runtime code");
  const staking = new ethers.Contract(STAKING, ["function echoToken() view returns (address)"], provider);
  const liveToken = await staking.echoToken();
  const match = liveRuntime.toLowerCase() === fixtureRuntime.toLowerCase();
  const output = {
    comparisonArtifact: path.relative(process.cwd(), artifactPath),
    compilerTarget: "solc 0.8.24; optimizer 200; Cancun; viaIR true (local hypothesis)",
    chainId: Number(network.chainId),
    stakingAddress: STAKING,
    liveToken,
    expectedToken: TOKEN,
    tokenBindingMatches: liveToken.toLowerCase() === TOKEN.toLowerCase(),
    liveRuntimeBytes: (liveRuntime.length - 2) / 2,
    comparisonRuntimeBytes: (fixtureRuntime.length - 2) / 2,
    liveRuntimeHash: ethers.keccak256(liveRuntime),
    comparisonRuntimeHash: ethers.keccak256(fixtureRuntime),
    exactRuntimeMatch: match,
    note: "A mismatch is not proof of vulnerability. Compiler metadata, immutable constructor values, compiler settings, dependency versions or source differences can affect bytecode. This is not an exact-source verification."
  };
  console.log(JSON.stringify(output, null, 2));
  if (!output.tokenBindingMatches) { console.error("STOP: wrong token binding"); process.exitCode = 1; }
  else if (!match) { console.error("NO-GO: production bytecode equivalence remains unverified"); process.exitCode = 2; }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
