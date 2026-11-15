#!/usr/bin/env node
"use strict";
// Read-only offline verification of the exact 20-signal V3 proof and
// two 5-signal V4 geographic-bound proofs. Does not authorize execution.
const fs=require("node:fs");
const path=require("node:path");
const snarkjs=require("snarkjs");
const root=path.resolve(__dirname,"..");
const data=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const cases=[
 {name:"V3 Amoy-matching (20 signals)",key:"build/v3-timestamp-fixed/verification_key.json",proof:"build/v4-geographic-bound/proofs/v3-amoy-matching-proof.json",pub:"build/v4-geographic-bound/proofs/v3-amoy-matching-public.json",count:20},
 {name:"V4 approved-zone (5 signals)",key:"build/v4-geographic-bound/setup/verification_key.json",proof:"build/v4-geographic-bound/proofs/approved-zone-proof.json",pub:"build/v4-geographic-bound/proofs/approved-zone-public.json",count:5},
 {name:"V4 valid (5 signals)",key:"build/v4-geographic-bound/setup/verification_key.json",proof:"build/v4-geographic-bound/proofs/valid-proof.json",pub:"build/v4-geographic-bound/proofs/valid-public.json",count:5}
];
(async()=>{
 let valid=0;
 for(const item of cases){
  console.log("\n"+item.name);
  console.log(" key: "+item.key);
  console.log(" proof: "+item.proof);
  console.log(" public: "+item.pub);
  try{
   const key=data(item.key),proof=data(item.proof),pub=data(item.pub);
   if(!Array.isArray(pub)||pub.length!==item.count||Number(key.nPublic)!==item.count)
    throw Error("public signal count does not match expected circuit ABI");
   const ok=await snarkjs.groth16.verify(key,pub,proof);
   console.log(" RESULT: "+(ok?"VALID":"INVALID"));
   if(ok)valid++;
  }catch(e){console.log(" RESULT: BLOCKED — "+e.message);}
 }
 console.log("\nSUMMARY: "+valid+"/"+cases.length+" verified");
 console.log("These fixtures may describe DIFFERENT checkpoints or deployments.");
 console.log("No claim of linked proofs, on-chain validity, or execution is made.");
 if(valid!==cases.length)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
