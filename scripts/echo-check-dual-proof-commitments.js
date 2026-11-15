#!/usr/bin/env node
"use strict";
// Read-only cross-circuit commitment compatibility gate.
// Valid Groth16 proofs are necessary but not sufficient for authorization.
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const v3Path="build/v4-geographic-bound/proofs/v3-amoy-matching-public.json";
const v4Paths=[
 "build/v4-geographic-bound/proofs/approved-zone-public.json",
 "build/v4-geographic-bound/proofs/valid-public.json"
];
function scalar(v){
 if(typeof v!=="string"&&typeof v!=="number"&&typeof v!=="bigint")throw Error("Non-scalar signal");
 const n=BigInt(v);
 if(n<0n)throw Error("Negative public signal");
 return n;
}
function run(){
 const v3=read(v3Path);
 if(!Array.isArray(v3)||v3.length!==20)throw Error("V3 public signals must contain exactly 20 values");
 const commitment=scalar(v3[18]);
 console.log("Echo Protocol Z — dual-proof checkpoint commitment binding");
 console.log("V3 public signals: "+v3Path);
 console.log("V3 checkpoint commitment [18]: "+commitment);
 let matches=0;
 for(const p of v4Paths){
  const s=read(p);
  if(!Array.isArray(s)||s.length!==5)throw Error("V4 signals must contain exactly 5 values: "+p);
  const value=scalar(s[4]);
  const match=value===commitment;
  console.log("\nV4 public signals: "+p);
  console.log("V4 checkpoint commitment [4]: "+value);
  console.log("MATCH: "+(match?"YES":"NO"));
  if(match)matches++;
 }
 console.log("\nSUMMARY: "+matches+"/"+v4Paths.length+" V4 proof fixtures share the V3 checkpoint commitment");
 console.log("Even a matching commitment does not establish checkpoint signature,");
 console.log("zone hash, trusted validator, approved policy, chain/nonce, or on-chain verifier validity.");
 if(matches===0)process.exitCode=1;
}
try{run()}catch(e){console.error("BLOCKED: "+e.message);process.exitCode=1;}
