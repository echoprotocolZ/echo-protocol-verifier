#!/usr/bin/env node
"use strict";
// Read-only artifact provenance and compatible-key discovery. Does not print witnesses.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),build=path.join(root,"build");
const skip=new Set(["node_modules",".git","cache","artifacts","coverage"]);
function walk(dir,depth=0,out=[]){
 if(depth>10||!fs.existsSync(dir))return out;
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(entry.isSymbolicLink())continue;
  const p=path.join(dir,entry.name);
  if(entry.isDirectory()){if(!skip.has(entry.name))walk(p,depth+1,out);}
  else if(entry.isFile()&&/verification.key\.json$|\.zkey$/i.test(entry.name))out.push(p);
 }
 return out;
}
const rel=p=>path.relative(root,p);
const sha=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const keys=walk(build).filter(p=>path.basename(p)==="verification_key.json");
console.log("Echo Protocol Z — verification key provenance");
for(const p of keys){
 try{
  const obj=JSON.parse(fs.readFileSync(p,"utf8"));
  console.log("KEY "+rel(p)+" nPublic="+obj.nPublic+" sha256="+sha(p));
 }catch(e){console.log("KEY "+rel(p)+" ERROR "+e.message);}
}
const a=path.join(build,"v4-geographic-bound/setup/verification_key.json");
const b=path.join(build,"v4-geographic-bound/verification_key.json");
if(fs.existsSync(a)&&fs.existsSync(b)){
 const ka=JSON.parse(fs.readFileSync(a,"utf8")),kb=JSON.parse(fs.readFileSync(b,"utf8"));
 console.log("\nGeographic-bound key comparison:");
 console.log(" byte-identical: "+(sha(a)===sha(b)));
 console.log(" structurally identical: "+(JSON.stringify(ka)===JSON.stringify(kb)));
}
console.log("\n20-public-input keys:");
const matching=keys.filter(p=>{
 try{return Number(JSON.parse(fs.readFileSync(p,"utf8")).nPublic)===20;}
 catch{return false;}
});
for(const p of matching)console.log(" "+rel(p));
if(!matching.length)console.log(" NONE FOUND under build/");
console.log("\nZKEY artifacts:");
for(const p of walk(build).filter(p=>p.endsWith(".zkey")))console.log(" "+rel(p));
console.log("\nA matching key alone is not proof of compatibility with the deployed on-chain verifier.");
