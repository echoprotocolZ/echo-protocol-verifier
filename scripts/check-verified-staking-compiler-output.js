#!/usr/bin/env node
/** Inspect exact verified-source solc output. No network calls. */
const fs=require("node:fs"),path=require("node:path");
const file=path.resolve(__dirname,"../production-evidence/compiler-output.json");
const raw=fs.readFileSync(file,"utf8");
const start=raw.indexOf("{");
if(start<0)throw Error("No JSON in compiler output");
const output=JSON.parse(raw.slice(start));
const errors=(output.errors||[]).filter(e=>e.severity==="error");
if(errors.length){errors.forEach(e=>console.error(e.formattedMessage||e.message));process.exit(1);}
const contract=output.contracts?.["contracts/EchoStaking.sol"]?.EchoStaking;
if(!contract)throw Error("EchoStaking missing from compiler output");
const runtime=contract.evm?.deployedBytecode?.object;
if(!runtime)throw Error("No deployed runtime bytecode");
const refs=contract.evm?.deployedBytecode?.immutableReferences||{};
console.log(JSON.stringify({
  contract:"EchoStaking",
  compiler:"solc 0.8.24",
  compiledRuntimeBytes:runtime.length/2,
  knownPolygonRuntimeBytes:16123,
  runtimeSizeMatchesKnownPolygon:(runtime.length/2)===16123,
  immutableReferences:refs,
  warnings:(output.errors||[]).filter(e=>e.severity==="warning").length,
  note:"Size equality is not bytecode equality. Immutable token constructor arguments, compiler metadata, and on-chain runtime must still be compared."
},null,2));
