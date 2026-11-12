#!/usr/bin/env node
/**
 * Fetch PolygonScan verified source and compiler metadata (read-only).
 * Etherscan API V2 requires an API key; Polygon chain ID 137.
 * Usage: ETHERSCAN_API_KEY=... node scripts/fetch-polygon-staking-verified-source.js
 * Writes a local evidence report; NEVER commits the API key.
 */
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const ADDRESS = "0x11bddDCE9770687675Afdef5AA9F001fcC837E4B";
const DEST = path.resolve(__dirname, "../production-evidence");
const API = "https://api.etherscan.io/v2/api";
function getJson(url) {
  return new Promise((resolve,reject)=>{
    https.get(url,{timeout:20000},res=>{
      let data="";res.on("data",c=>data+=c);
      res.on("end",()=>{
        try { const json=JSON.parse(data); if(res.statusCode!==200) throw Error("HTTP "+res.statusCode);resolve(json); }
        catch(e){reject(Error("API response could not be parsed: "+e.message));}
      });
    }).on("error",reject);
  });
}
function parseSource(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return {kind:"single-file",files:{"EchoStaking.sol":raw},settings:null};
  // Etherscan V2 sometimes returns Standard JSON with an extra outer brace pair.
  const candidates = [trimmed];
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) candidates.push(trimmed.slice(1,-1));
  let obj;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") { obj = parsed; break; }
    } catch (_) { /* try alternate wrapper */ }
  }
  if (!obj) throw Error("Verified source JSON is invalid after checking standard and Etherscan-wrapped formats");
  if (!obj.sources) return {kind:"unrecognized-json",files:{"verified-source.json":raw},settings:null};
  const files={};
  for(const [name,source] of Object.entries(obj.sources)){
    if(typeof source.content==="string") files[name]=source.content;
  }
  if (Object.keys(files).length === 0) throw Error("Verified Standard JSON contains no source file contents");
  return {kind:"standard-json",files,settings:obj.settings||null};
}

async function main() {
  const key=process.env.ETHERSCAN_API_KEY;
  if(!key || key==="YOUR_API_KEY") throw Error("Set ETHERSCAN_API_KEY to an Etherscan API V2 key (do not paste the key in chat)");
  const url=new URL(API);
  for(const [k,v] of Object.entries({chainid:"137",module:"contract",action:"getsourcecode",address:ADDRESS,apikey:key}))url.searchParams.set(k,v);
  const response=await getJson(url);
  if(response.status!=="1" || !Array.isArray(response.result)) throw Error("PolygonScan source request failed: "+String(response.message)+" / "+String(typeof response.result==="string"?response.result:"unknown response"));
  const record=response.result[0];
  if(!record || !record.SourceCode) throw Error("No verified source returned for staking contract");
  const parsed=parseSource(record.SourceCode);
  fs.mkdirSync(DEST,{recursive:true});
  const safeFiles={};
  for(const [name,source] of Object.entries(parsed.files)){
    // Store source under generated filenames, avoiding path traversal from remote filenames.
    const basename=path.basename(name).replace(/[^a-zA-Z0-9_.-]/g,"_");
    const unique=String(Object.keys(safeFiles).length).padStart(3,"0")+"-"+basename;
    fs.writeFileSync(path.join(DEST,unique),source);
    safeFiles[name]=unique;
  }
  const metadata={
    address:ADDRESS,
    contractName:record.ContractName,
    compilerVersion:record.CompilerVersion,
    optimizationUsed:record.OptimizationUsed,
    runs:record.Runs,
    evmVersion:record.EVMVersion,
    viaIR:record.ViaIR??"not supplied",
    constructorArguments:record.ConstructorArguments||"",
    proxy:record.Proxy,
    implementation:record.Implementation,
    licenseType:record.LicenseType,
    sourceKind:parsed.kind,
    sourceFiles:safeFiles,
    standardJsonSettings:parsed.settings,
    warning:"Source verification and exact deployed runtime reproduction are distinct. Compare dependency versions, compiler inputs and constructor immutables before claiming equivalence."
  };
  fs.writeFileSync(path.join(DEST,"metadata.json"),JSON.stringify(metadata,null,2));
  console.log(JSON.stringify(metadata,null,2));
  console.log("Verified source saved under production-evidence/ (do not commit without reviewing)");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
