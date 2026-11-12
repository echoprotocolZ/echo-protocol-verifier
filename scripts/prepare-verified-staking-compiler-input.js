#!/usr/bin/env node
/**
 * Reproduce verified PolygonScan Standard JSON using EXACT retrieved source files.
 * No chain transactions, no API key needed. Requires the previously downloaded
 * production-evidence/metadata.json and mapped source files.
 *
 * Step 1: node scripts/prepare-verified-staking-compiler-input.js
 * Step 2: npx --yes solc@0.8.24 --standard-json < production-evidence/compiler-input.json > production-evidence/compiler-output.json
 * Step 3: node scripts/check-verified-staking-compiler-output.js
 */
const fs=require("node:fs");
const path=require("node:path");
const base=path.resolve(__dirname,"../production-evidence");
const metadata=JSON.parse(fs.readFileSync(path.join(base,"metadata.json"),"utf8"));
if(metadata.compilerVersion!=="v0.8.24+commit.e11b9ed9") throw Error("Unexpected compiler version: "+metadata.compilerVersion);
if(metadata.sourceKind!=="standard-json" || !metadata.standardJsonSettings) throw Error("Expected verified Standard JSON");
const sources={};
for(const [sourceName,savedName] of Object.entries(metadata.sourceFiles)){
  const full=path.resolve(base,savedName);
  if(!full.startsWith(base+path.sep)) throw Error("Unsafe source filename");
  sources[sourceName]={content:fs.readFileSync(full,"utf8")};
}
if(!sources["contracts/EchoStaking.sol"]) throw Error("Missing verified EchoStaking source");
const settings=structuredClone(metadata.standardJsonSettings);
if(settings.optimizer?.enabled!==false) throw Error("Expected production optimizer disabled");
settings.outputSelection={"*":{"*":["abi","evm.bytecode","evm.deployedBytecode","metadata"]}};
const input={language:"Solidity",sources,settings};
const output=path.join(base,"compiler-input.json");
fs.writeFileSync(output,JSON.stringify(input));
console.log("Wrote",output);
console.log("Verified sources:",Object.keys(sources).length);
console.log("Compiler: 0.8.24; optimizer disabled; default EVM; no viaIR override");
console.log("Next: npx --yes solc@0.8.24 --standard-json < production-evidence/compiler-input.json > production-evidence/compiler-output.json");
