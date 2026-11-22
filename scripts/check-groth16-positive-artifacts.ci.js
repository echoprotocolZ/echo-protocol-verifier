#!/usr/bin/env node
"use strict";
// Readiness checks MUST use the original recorded paths, not invented filenames.
// Never output key contents, regenerate trusted setup, or deploy.
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const manifest = require("../docs/ECHO_V3_ARTIFACT_MANIFEST.json");
const root = process.cwd();
const required = [
  ...["provingKey","verificationKey","witnessWasm","publicSignals","proof"].map(k => ({
    label: "V3/"+k, ...manifest.artifacts[k]
  })),
  {label:"V4/provingKey",path:"build/v4-geographic-bound/setup/EchoGeographicBoundV4_final.zkey"},
  {label:"V4/verificationKey",path:"build/v4-geographic-bound/setup/verification_key.json"},
  {label:"V4/witnessWasm",path:"build/v4-geographic-bound/EchoGeographicBoundV4_js/EchoGeographicBoundV4.wasm"}
];
let missing=0, mismatched=0;
for(const item of required){
  const absolute=path.resolve(root,item.path);
  if(!absolute.startsWith(root+path.sep)) throw Error("Unsafe artifact path");
  if(!fs.existsSync(absolute) || !fs.statSync(absolute).isFile() || fs.statSync(absolute).size===0){
    console.log("MISSING_OR_EMPTY",item.label,item.path); missing++;continue;
  }
  const bytes=fs.readFileSync(absolute);
  const digest=crypto.createHash("sha256").update(bytes).digest("hex");
  console.log("PRESENT",item.label,item.path,"bytes="+bytes.length,"sha256="+digest);
  if(item.sha256 && item.sha256!==digest){
    console.error("HASH_MISMATCH",item.label);mismatched++;
  }
  if(item.path.endsWith(".json")){
    try{JSON.parse(bytes.toString("utf8"))}catch{console.error("INVALID_JSON",item.label);mismatched++}
  }
}
if(missing||mismatched){
  console.error("FAIL: missing="+missing+" invalid_or_mismatched="+mismatched);
  console.error("Retrieve original development artifacts from an approved secure archive. Never fabricate a new setup to satisfy this gate.");
  process.exitCode=1;
}else{
  console.log("FILE/HASH READINESS PASSED; this alone does not establish proof validity or production ceremony security.");
}
