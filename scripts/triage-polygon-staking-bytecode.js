#!/usr/bin/env node
/**
 * Read-only production compatibility triage.
 * POLYGON_RPC_URL=https://... node scripts/triage-polygon-staking-bytecode.js
 * Never approves targets or broadcasts transactions.
 */
const { ethers, artifacts } = require("hardhat");

const ADDRESS = "0x11bddDCE9770687675Afdef5AA9F001fcC837E4B";
const TOKEN = "0x9511Ee84398B8Deb725d8967c16693C96C43e0eD";
const ERC1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ERC1967_BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const READS = [
  "function echoToken() view returns (address)",
  "function minimumStake() view returns (uint256)",
  "function totalStaked() view returns (uint256)",
  "function paused() view returns (bool)",
  "function owner() view returns (address)",
  "function getValidatorStake(address) view returns (uint256)"
];
function nonzeroAddress(word) {
  const value = "0x" + word.slice(-40);
  return value.toLowerCase() === ethers.ZeroAddress.toLowerCase() ? null : ethers.getAddress(value);
}
async function main() {
  const url = process.env.POLYGON_RPC_URL;
  if (!url || !/^https?:\/\//i.test(url)) throw new Error("Set POLYGON_RPC_URL to an actual http(s) Polygon RPC URL");
  const provider = new ethers.JsonRpcProvider(url);
  const network = await provider.getNetwork();
  if (network.chainId !== 137n) throw new Error("Expected Polygon chain ID 137");
  const code = await provider.getCode(ADDRESS);
  if (code === "0x") throw new Error("No deployed code");
  const fixture = await artifacts.readArtifact("EchoStakingSourceFixture");
  const fixtureCode = fixture.deployedBytecode;
  const iface = new ethers.Interface(READS);
  const selectors = Object.fromEntries(READS.map(s => {
    const fragment = iface.getFunction(s.slice("function ".length).split("(")[0]);
    return [fragment.name, {selector:fragment.selector, selectorPresentInRuntime:code.toLowerCase().includes(fragment.selector.slice(2).toLowerCase())}];
  }));
  const staking = new ethers.Contract(ADDRESS, READS, provider);
  const values = {};
  for (const method of ["echoToken", "minimumStake", "totalStaked", "paused", "owner"]) {
    try { values[method] = String(await staking[method]()); }
    catch (e) { values[method] = "READ FAILED: " + (e.shortMessage || e.message); }
  }
  const [implementationWord, beaconWord] = await Promise.all([
    provider.getStorage(ADDRESS, ERC1967_IMPL_SLOT),
    provider.getStorage(ADDRESS, ERC1967_BEACON_SLOT)
  ]);
  const implementation = nonzeroAddress(implementationWord);
  const beacon = nonzeroAddress(beaconWord);
  const proxyMinimal = /^0x363d3d373d3d3d363d73[0-9a-f]{40}5af43d82803e903d91602b57fd5bf3$/i.test(code);
  const output = {
    chainId:137,
    blockNumber:await provider.getBlockNumber(),
    stakingAddress:ADDRESS,
    expectedToken:TOKEN,
    onchainValues:values,
    tokenBindingMatches:values.echoToken.toLowerCase() === TOKEN.toLowerCase(),
    deployedRuntimeBytes:(code.length-2)/2,
    deployedRuntimeHash:ethers.keccak256(code),
    fixtureRuntimeBytes:(fixtureCode.length-2)/2,
    fixtureRuntimeHash:ethers.keccak256(fixtureCode),
    exactRuntimeMatch:code.toLowerCase() === fixtureCode.toLowerCase(),
    eip1967Implementation:implementation,
    eip1967Beacon:beacon,
    eip1167MinimalProxy:proxyMinimal,
    functionSelectorHeuristics:selectors,
    caveats:[
      "Selector presence is only a heuristic, not a behavior or ABI proof.",
      "Empty EIP-1967 slots do not prove absence of all proxy patterns.",
      "Different runtime hashes can result from immutables, compiler configuration, metadata, or source differences.",
      "Do not approve the deployed target until independently reviewed verified source and reproducible compiler inputs establish compatibility."
    ]
  };
  console.log(JSON.stringify(output,null,2));
  if (!output.tokenBindingMatches) {console.error("STOP: token mismatch");process.exitCode=1;}
  else if (!output.exactRuntimeMatch) {console.error("NO-GO: bytecode equivalence not established");process.exitCode=2;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
