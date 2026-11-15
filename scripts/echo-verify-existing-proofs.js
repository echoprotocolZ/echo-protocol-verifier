#!/usr/bin/env node
"use strict";
// Independent offline Groth16 proof verification. No private witness data printed.
// Usage: node scripts/echo-verify-existing-proofs.js
const fs=require("node:fs");
const path=require("node:path");
const snarkjs=require("snarkjs");
const root=path.resolve(__dirname,"..");
const skip=new Set(["node_modules",".git","cache","artifacts","coverage"]);
function scan(dir,depth=0,out=[]){
 if(depth>7)return out;
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(e.isSymbolicLink())continue;
  const p=path.join(dir,e.name);
  if(e.isDirectory()){if(!skip.has(e.name))scan(p,depth+1,out);}
  else if(e.isFile()&&/\.json$/i.test(e.name))out.push(p);
 }
 return out;
}
function kind(p){
 const rel=path.relative(root,p).toLowerCase();
 if(rel.includes("v4-geographic")||rel.includes("geographic"))return "V4";
 if(rel.includes("v3")||rel.startsWith("build/"))return "V3";
 return null;
}
function classify(p){
 const name=path.basename(p).toLowerCase();
 if(name==="verification_key.json")return "key";
 if(/^(proof|.*-proof|proof-.*)\.json$/.test(name))return "proof";
 if(/^(public|public_signals|public-signals|.*-public|.*-signals)\.json$/.test(name))return "public";
 return null;
}
const files=scan(path.join(root,"build"));
const by={V3:{key:[],proof:[],public:[]},V4:{key:[],proof:[],public:[]}};
for(const p of files){
 const k=kind(p),t=classify(p);
 if(k&&t)by[k][t].push(p);
}
function rel(p){return path.relative(root,p);}
function parse(p){return JSON.parse(fs.readFileSync(p,"utf8"));}
async function verify(k){
 const x=by[k];
 console.log("\n"+k+" candidates:");
 for(const t of ["key","proof","public"])console.log(" "+t+": "+(x[t].map(rel).join(", ")||"MISSING"));
 if(!x.key.length||!x.proof.length||!x.public.length){
  console.log(" "+k+" BLOCKED: missing JSON verification key, proof, or public signals.");
  return false;
 }
 // Multiple candidates are ambiguous; do not silently pair unrelated artifacts.
 if(x.key.length!==1||x.proof.length!==1||x.public.length!==1){
  console.log(" "+k+" BLOCKED: multiple candidates; choose a matching triple explicitly.");
  return false;
 }
 try{
  const key=parse(x.key[0]),proof=parse(x.proof[0]),signals=parse(x.public[0]);
  if(!Array.isArray(signals))throw Error("public signals must be a JSON array");
  const expected=k==="V3"?20:5;
  if(signals.length!==expected)throw Error("expected "+expected+" public signals; got "+signals.length);
  const ok=await snarkjs.groth16.verify(key,signals,proof);
  console.log(" "+k+" Groth16 verification: "+(ok?"VALID":"INVALID"));
  return ok;
 }catch(e){
  console.log(" "+k+" BLOCKED: "+e.message);
  return false;
 }
}
(async()=>{
 const v3=await verify("V3"),v4=await verify("V4");
 console.log("\nRESULT: "+(v3&&v4?"BOTH PROOFS VALID OFF-CHAIN":"NOT READY FOR ON-CHAIN EXECUTION"));
 console.log("Off-chain validity alone does not prove checkpoint, signature, nonce,");
 console.log("geographic policy, or on-chain authorization correctness.");
 if(!v3||!v4)process.exitCode=1;
})().catch(e=>{console.error("Verification failed:",e.message);process.exitCode=1;});
