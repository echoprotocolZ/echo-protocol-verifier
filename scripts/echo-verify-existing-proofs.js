#!/usr/bin/env node
"use strict";
// Offline proof verification with explicit matching rules; never mixes artifacts
// across circuits or backup directories. No witness/private data is printed.
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
  if(e.isDirectory()){if(!skip.has(e.name)&&!e.name.includes(".backup"))walk(p,depth+1,out);}
  else if(e.isFile()&&e.name.endsWith(".json"))out.push(p);
 }
 return out;
}
const all=walk(path.join(root,"build"));
function scope(p){
 const s=rel(p).toLowerCase();
 if(s.startsWith("build/v4-geographic-bound/"))return "V4-geographic-bound";
 if(s.startsWith("build/v4-geographic/"))return "V4-geographic";
 if(s.startsWith("build/v3/")||s.startsWith("build/v3-"))return "V3";
 if(s.startsWith("build/"))return "V3-root";
 return "unknown";
}
const groups=new Map();
for(const proof of all.filter(p=>/-proof\.json$/i.test(path.basename(p)))){
 const base=path.basename(proof).replace(/-proof\.json$/i,"");
 if(/tamper|invalid|negative|bad/i.test(base))continue;
 const pub=path.join(path.dirname(proof),base+"-public.json");
 if(!fs.existsSync(pub))continue;
 const id=scope(proof),key=id+"|"+path.dirname(proof);
 if(!groups.has(key))groups.set(key,[]);
 groups.get(key).push({proof,pub,id});
}
function keysFor(item){
 const dir=path.dirname(item.proof),parent=path.dirname(dir);
 const locations=[dir,path.join(parent,"setup"),parent];
 if(item.id==="V3-root")locations.push(path.join(root,"build"));
 if(item.id==="V4-geographic")locations.push(path.join(root,"build/v4-geographic/setup"));
 if(item.id==="V4-geographic-bound")locations.push(path.join(root,"build/v4-geographic-bound/setup"));
 return [...new Set(locations.map(d=>path.join(d,"verification_key.json")))].filter(fs.existsSync);
}
async function run(){
 let valid=0,invalid=0,blocked=0;
 console.log("Echo Protocol Z — matched offline Groth16 verification");
 for(const [,items] of groups){
  for(const item of items){
   console.log("\nPAIR "+rel(item.proof)+" + "+rel(item.pub));
   const keys=keysFor(item);
   if(keys.length!==1){
    console.log(" BLOCKED: expected exactly one unambiguous verification key; found "+keys.length);
    for(const k of keys)console.log(" KEY CANDIDATE "+rel(k));
    blocked++;continue;
   }
   try{
    const key=JSON.parse(fs.readFileSync(keys[0],"utf8"));
    const proof=JSON.parse(fs.readFileSync(item.proof,"utf8"));
    const pub=JSON.parse(fs.readFileSync(item.pub,"utf8"));
    if(!Array.isArray(pub))throw Error("public signals must be an array");
    if(pub.length!==(item.id.startsWith("V4")?5:20))
      throw Error("unexpected signal count "+pub.length);
    const ok=await snarkjs.groth16.verify(key,pub,proof);
    console.log(" KEY "+rel(keys[0]));
    console.log(" "+(ok?"VALID":"INVALID")+" ("+item.id+")");
    if(ok)valid++;else invalid++;
   }catch(e){console.log(" BLOCKED: "+e.message);blocked++;}
  }
 }
 if(!groups.size)console.log("No matching *-proof.json / *-public.json pairs found.");
 console.log("\nSUMMARY: "+valid+" valid, "+invalid+" invalid, "+blocked+" blocked");
 console.log("No result here establishes matching V3/V4 checkpoint commitments,");
 console.log("signatures, account policy, on-chain verification, or execution.");
 if(!valid||invalid||blocked)process.exitCode=1;
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
