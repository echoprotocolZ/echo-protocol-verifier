#!/usr/bin/env node
"use strict";
// Read-only, offline Groth16 verification of candidate proof/public pairs.
// Candidate keys are tested independently, never inferred from a V3/V4 label.
// This does not authorize transactions or demonstrate production compatibility.
const fs=require("node:fs");
const path=require("node:path");
const snarkjs=require("snarkjs");
const root=path.resolve(__dirname,"..");
const skip=new Set(["node_modules",".git","cache","artifacts","coverage"]);
const rel=p=>path.relative(root,p);
function walk(dir,depth=0,out=[]){
 if(depth>8||!fs.existsSync(dir))return out;
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(e.isSymbolicLink())continue;
  const p=path.join(dir,e.name);
  if(e.isDirectory()){
   if(!skip.has(e.name)&&!e.name.includes(".backup"))walk(p,depth+1,out);
  }else if(e.isFile()&&e.name.endsWith(".json"))out.push(p);
 }
 return out;
}
const all=walk(path.join(root,"build"));
const pairs=all.filter(p=>/-proof\.json$/i.test(path.basename(p)))
 .filter(p=>!/tamper|invalid|negative|bad/i.test(path.basename(p)))
 .map(proof=>{
  const pub=proof.replace(/-proof\.json$/i,"-public.json");
  return {proof,pub};
 }).filter(x=>fs.existsSync(x.pub));
function keyCandidates(proof){
 const dir=path.dirname(proof),parent=path.dirname(dir);
 const dirs=[dir,path.join(parent,"setup"),parent];
 // Only a key within the same circuit subtree, never an unrelated root key.
 if(parent===path.join(root,"build"))dirs.push(parent);
 return [...new Set(dirs.map(d=>path.join(d,"verification_key.json")))]
  .filter(fs.existsSync);
}
function load(p){return JSON.parse(fs.readFileSync(p,"utf8"));}
async function run(){
 let verifiedPairs=0,failedPairs=0,blockedPairs=0;
 console.log("Echo Protocol Z — independent proof/key matching");
 for(const {proof,pub} of pairs){
  console.log("\nPAIR "+rel(proof)+" + "+rel(pub));
  let signals;
  try{
   signals=load(pub);
   if(!Array.isArray(signals))throw Error("public signals are not an array");
  }catch(e){console.log(" BLOCKED public signals: "+e.message);blockedPairs++;continue;}
  console.log(" Public signals: "+signals.length);
  const keys=keyCandidates(proof);
  if(!keys.length){console.log(" BLOCKED: no same-circuit verification key found");blockedPairs++;continue;}
  let compatible=0,passed=0,attempted=0;
  for(const k of keys){
   try{
    const vk=load(k);
    const expected=Number(vk.nPublic);
    if(!Number.isSafeInteger(expected)||expected<0){
     console.log(" KEY "+rel(k)+": BLOCKED (missing/invalid nPublic)");continue;
    }
    if(expected!==signals.length){
     console.log(" KEY "+rel(k)+": SKIPPED (nPublic="+expected+")");continue;
    }
    compatible++;
    const candidate=load(proof);
    attempted++;
    const valid=await snarkjs.groth16.verify(vk,signals,candidate);
    console.log(" KEY "+rel(k)+": "+(valid?"VALID":"INVALID"));
    if(valid)passed++;
   }catch(e){
    console.log(" KEY "+rel(k)+": ERROR ("+e.message+")");
   }
  }
  if(passed===1){
   console.log(" PAIR RESULT: VERIFIED with exactly one matching key");
   verifiedPairs++;
  }else if(passed>1){
   console.log(" PAIR RESULT: BLOCKED — multiple valid keys; provenance unresolved");
   blockedPairs++;
  }else if(!compatible||!attempted){
   console.log(" PAIR RESULT: BLOCKED — no successfully evaluated compatible key");
   blockedPairs++;
  }else{
   console.log(" PAIR RESULT: NOT VERIFIED");
   failedPairs++;
  }
 }
 if(!pairs.length)console.log("No matching *-proof.json and *-public.json pairs found.");
 console.log("\nSUMMARY: "+verifiedPairs+" verified pairs, "+failedPairs+" unverified, "+blockedPairs+" blocked");
 console.log("Circuit version, checkpoint linkage, validator signature, on-chain");
 console.log("verifier identity, geographic policy and execution remain unproven.");
 if(!verifiedPairs||failedPairs||blockedPairs)process.exitCode=1;
}
run().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
