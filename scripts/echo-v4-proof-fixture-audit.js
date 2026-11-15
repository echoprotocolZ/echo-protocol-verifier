#!/usr/bin/env node
"use strict";
// Read-only artifact inventory. Does not generate or validate cryptographic proofs.
// Never treat an existing file as evidence that a proof is valid.
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const skip=new Set(["node_modules",".git","cache","artifacts","coverage",".next"]);
const candidates=[];
function walk(dir,depth){
 if(depth>6)return;
 let entries;
 try{entries=fs.readdirSync(dir,{withFileTypes:true});}
 catch(e){console.error("Cannot read",dir,e.message);process.exitCode=2;return;}
 for(const entry of entries){
  if(entry.isSymbolicLink())continue;
  const full=path.join(dir,entry.name);
  if(entry.isDirectory()){
   if(!skip.has(entry.name))walk(full,depth+1);
  }else if(entry.isFile()&&/\.(json|wasm|zkey|wtns|r1cs)$/i.test(entry.name)){
   const rel=path.relative(root,full);
   if(/proof|public|signal|witness|verification.key|verifier|\.zkey|\.wasm|\.wtns|\.r1cs/i.test(rel))
    candidates.push(rel);
  }
 }
}
walk(root,0);
candidates.sort();
console.log("Echo Protocol Z — local proof artifact inventory");
console.log("This inventory is NOT a proof verification or launch approval.\n");
for(const f of candidates)console.log("  "+f);
if(!candidates.length)console.log("  No candidate artifacts found.");
const has=(regex)=>candidates.some(p=>regex.test(p));
const checks=[
 ["V3 witness/proof input",has(/v3.*(input|witness|proof|\.wtns)/i)],
 ["V3 public signals",has(/v3.*(public|signal)/i)],
 ["V4 witness/proof input",has(/v4.*(input|witness|proof|\.wtns)/i)],
 ["V4 public signals",has(/v4.*(public|signal)/i)],
 ["Proving key",has(/\.zkey$/i)],
 ["Circuit WASM",has(/\.wasm$/i)]
];
console.log("\nCandidate artifact presence (filename heuristics only):");
for(const [name,ok] of checks)console.log("  "+(ok?"FOUND ":"MISSING ")+name);
console.log("\nNext gate: independently verify both Groth16 proofs against their matching");
console.log("verification keys and public signals, then test the full on-chain");
console.log("signed-checkpoint authorization, execution, nonce and replay path.");
if(checks.some(([,ok])=>!ok))process.exitCode=1;
