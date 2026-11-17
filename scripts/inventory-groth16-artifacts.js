#!/usr/bin/env node
"use strict";
// Read-only local artifact inventory. Does not expose private witness contents.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const roots=["build","circuits","artifacts","proofs","scripts","test","."];
const extensions=new Set([".zkey",".wasm",".r1cs",".wtns",".circom"]);
const names=/^(verification_key|public|proof|input|witness)([-_.].*)?\.json$/i;
const skip=new Set(["node_modules",".git","cache","coverage","typechain","typechain-types"]);
const seen=new Set(),found=[];
function walk(dir,depth){
 if(depth>5||!fs.existsSync(dir))return;
 let stat;try{stat=fs.statSync(dir)}catch{return}
 if(!stat.isDirectory())return;
 let real;try{real=fs.realpathSync(dir)}catch{return}
 if(seen.has(real))return;seen.add(real);
 let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{return}
 for(const e of entries){
  if(skip.has(e.name))continue;
  const p=path.join(dir,e.name);
  if(e.isDirectory())walk(p,depth+1);
  else if(e.isFile()&&(extensions.has(path.extname(e.name).toLowerCase())||names.test(e.name))){
   const s=fs.statSync(p);
   found.push({path:p,size:s.size});
  }
 }
}
for(const root of roots)walk(root,0);
found.sort((a,b)=>a.path.localeCompare(b.path));
console.log("Echo Protocol Z — local Groth16 artifact inventory");
console.log("Read-only: file contents and witness values are not printed.");
if(!found.length)console.log("No circuit/proof artifacts found in scanned directories.");
for(const f of found)console.log(String(f.size).padStart(11)+" bytes  "+f.path);
const zkeys=found.filter(f=>f.path.endsWith(".zkey"));
const wasms=found.filter(f=>f.path.endsWith(".wasm"));
const vkeys=found.filter(f=>/verification_key.*\.json$/i.test(path.basename(f.path)));
console.log("\nSummary: "+zkeys.length+" zkey(s), "+wasms.length+" wasm(s), "+vkeys.length+" verification-key JSON file(s).");
console.log("Next: identify exact V3 and V4 zkey/wasm/vkey pairs and compare exported verifier keys before proving.");
console.log("Never commit witness files, private inputs, or production proving secrets.");
