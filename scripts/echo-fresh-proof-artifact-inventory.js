#!/usr/bin/env node
"use strict";
// Read-only inventory of source material needed to regenerate a fresh dual proof.
// Never prints witness values, private keys, or environment variable contents.
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const roots=["circuits","scripts","build/v3-timestamp-fixed","build/v4-geographic-bound","test","docs"];
const selected=/\.circom$|\.wasm$|\.zkey$|verification_key\.json$|\.r1cs$|\.sym$|\.js$|\.json$/i;
const relevant=/v3|v4|geo|timestamp|proof|witness|checkpoint|authorization|bound|amoy|signal|input/i;
const ignore=/node_modules|\.backup|backup-|\.git(?:\/|$)|\.env|secret|private|mnemonic|seed/i;
function walk(dir,depth,out){
 if(depth>5||!fs.existsSync(dir))return;
 for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,ent.name),relative=path.relative(root,full);
  if(ignore.test(relative)||ent.isSymbolicLink())continue;
  if(ent.isDirectory())walk(full,depth+1,out);
  else if(ent.isFile()&&selected.test(ent.name)&&relevant.test(relative))out.push(relative);
 }
}
const files=[];for(const dir of roots)walk(path.join(root,dir),0,files);
files.sort();
console.log("Echo Protocol Z — fresh proof generation artifact inventory");
for(const f of files)console.log(f);
const required=[
 "build/v3-timestamp-fixed/EchoAuthorizationVerifierV3_final.zkey",
 "build/v3-timestamp-fixed/verification_key.json",
 "build/v4-geographic-bound/setup/EchoGeographicBoundV4_final.zkey",
 "build/v4-geographic-bound/setup/verification_key.json"
];
console.log("\nREQUIRED PROVING ARTIFACTS");
for(const f of required)console.log((fs.existsSync(path.join(root,f))?"PRESENT ":"MISSING ")+f);
console.log("\nNEXT: identify the matching circuit WASM, input generators, and verifier-key provenance.");
console.log("Do not edit expired proof JSON or change its public signals: regenerate witnesses and proofs.");
