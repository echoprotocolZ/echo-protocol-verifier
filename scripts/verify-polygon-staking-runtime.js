#!/usr/bin/env node
/**
 * Read-only Polygon staking deployment fingerprint.
 * Usage: POLYGON_RPC_URL=https://... node scripts/verify-polygon-staking-runtime.js
 * Does not broadcast transactions or approve any contract.
 */
const { ethers, artifacts } = require("hardhat");

const STAKING = "0x11bddDCE9770687675Afdef5AA9F001fcC837E4B";
const EXPECTED_TOKEN = "0x9511Ee84398B8Deb725d8967c16693C96C43e0eD";
const ABI = [
  "function echoToken() view returns (address)",
  "function minimumStake() view returns (uint256)",
  "function totalStaked() view returns (uint256)",
  "function paused() view returns (bool)",
  "function owner() view returns (address)"
];

async function main() {
  if (!process.env.POLYGON_RPC_URL) throw new Error("Set POLYGON_RPC_URL to a trusted Polygon mainnet RPC endpoint");
  const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
  const network = await provider.getNetwork();
  if (network.chainId !== 137n) throw new Error(`Wrong chain: ${network.chainId}; expected Polygon mainnet (137)`);

  const runtime = await provider.getCode(STAKING);
  if (runtime === "0x") throw new Error("No staking contract runtime code at expected address");
  const tokenRuntime = await provider.getCode(EXPECTED_TOKEN);
  if (tokenRuntime === "0x") throw new Error("No ECHO token runtime code at expected address");

  const staking = new ethers.Contract(STAKING, ABI, provider);
  const results = {};
  for (const method of ["echoToken", "minimumStake", "totalStaked", "paused", "owner"]) {
    try { results[method] = String(await staking[method]()); }
    catch (e) { results[method] = `UNAVAILABLE: ${e.shortMessage || e.message}`; }
  }
  const tokenMatches = results.echoToken.toLowerCase() === EXPECTED_TOKEN.toLowerCase();
  const fixture = await artifacts.readArtifact("EchoStakingSourceFixture");
  const fixtureRuntime = fixture.deployedBytecode;
  const runtimeHash = ethers.keccak256(runtime);
  const fixtureHash = ethers.keccak256(fixtureRuntime);

  console.log(JSON.stringify({
    chainId: Number(network.chainId),
    blockNumber: await provider.getBlockNumber(),
    stakingAddress: STAKING,
    stakingRuntimeBytes: (runtime.length - 2) / 2,
    stakingRuntimeKeccak256: runtimeHash,
    expectedTokenAddress: EXPECTED_TOKEN,
    tokenRuntimeKeccak256: ethers.keccak256(tokenRuntime),
    onchainReadFunctions: results,
    tokenAddressMatches: tokenMatches,
    localFixtureRuntimeKeccak256: fixtureHash,
    exactRuntimeBytecodeMatchesLocalFixture: runtimeHash === fixtureHash,
    caveat: "The local fixture has constructor immutables and may differ for legitimate reasons. A hash match alone does not establish source/compiler provenance or safety. A mismatch means byte-for-byte equivalence is NOT established. Obtain verified mainnet source, compiler version/settings, linked libraries, constructor args, and compare reproducibly."
  }, null, 2));

  if (!tokenMatches) throw new Error("STAKING TOKEN MISMATCH — DO NOT APPROVE TARGET");
  if (runtimeHash !== fixtureHash) {
    console.error("NOT VERIFIED: on-chain staking runtime differs from local fixture. Mainnet approval remains NO-GO.");
    process.exitCode = 2;
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
