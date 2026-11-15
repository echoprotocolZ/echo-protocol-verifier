"use strict";
const {openExclusiveRevocationWriter}=require("./exclusive-revocation-writer");
const crypto=require("node:crypto");
const fs=require("node:fs");
const [directory,keyfile]=process.argv.slice(2);
let writer;
try{
 const publicKey=crypto.createPublicKey(fs.readFileSync(keyfile));
 writer=openExclusiveRevocationWriter(publicKey,directory);
 if(process.send)process.send({type:"acquired"});
}catch(e){if(process.send)process.send({type:"rejected",message:e.message});process.exit(2)}
process.on("message",message=>{
 if(message==="release"){try{writer.release();if(process.send)process.send({type:"released"})}catch(e){if(process.send)process.send({type:"error",message:e.message})}setImmediate(()=>process.exit(0))}
 if(message==="probe"){try{writer.fingerprints();if(process.send)process.send({type:"policy-ok"})}catch(e){if(process.send)process.send({type:"policy-error",message:e.message})}}
});
