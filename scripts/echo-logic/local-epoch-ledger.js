"use strict";
/**
 * Prototype durable local epoch ledger. Only one cooperative local writer
 * may advance it at a time. Not a distributed fencing authority.
 * Never auto-break stale ledger locks; use trusted external fencing.
 */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
function openLocalEpochLedger(directory){
 if(typeof directory!=="string"||!directory)throw Error("Ledger directory required");
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const ledger=path.join(directory,"fencing-epoch.json");
 const lock=path.join(directory,".fencing-epoch.lock");
 function read(){
  let value;
  try{value=JSON.parse(fs.readFileSync(ledger,"utf8"))}
  catch(e){if(e.code==="ENOENT")return 0;throw Error("Fencing ledger unreadable or corrupted")}
  if(!value||value.version!==1||!Number.isSafeInteger(value.epoch)||value.epoch<1)
   throw Error("Fencing ledger invalid");
  return value.epoch;
 }
 function acquire(){
  try{fs.mkdirSync(lock,{mode:0o700})}
  catch(e){if(e.code==="EEXIST")throw Error("Fencing ledger busy or stale lock");throw e}
  try{
   const old=read();
   if(old===Number.MAX_SAFE_INTEGER)throw Error("Fencing epoch exhausted");
   const next=old+1;
   const temp=path.join(directory,".fencing-"+crypto.randomBytes(12).toString("hex")+".tmp");
   let fd,renamed=false;
   try{
    fd=fs.openSync(temp,"wx",0o600);
    fs.writeFileSync(fd,JSON.stringify({version:1,epoch:next}));
    fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    fs.renameSync(temp,ledger);renamed=true;
    const dfd=fs.openSync(directory,"r");
    try{fs.fsyncSync(dfd)}finally{fs.closeSync(dfd)}
   }catch(e){
    if(fd!==undefined)fs.closeSync(fd);
    try{fs.unlinkSync(temp)}catch{}
    if(renamed)throw Error("Fencing ledger durability uncertain; stop all writers");
    throw Error("Fencing ledger write failed: "+e.message);
   }
   return next;
  }finally{
   // Never clear lock if persistence may have committed but durability is uncertain.
   // The lock is intentionally retained in that case.
   if(fs.existsSync(lock)){
    try{
     const current=read();
     if(current>=1)fs.rmdirSync(lock);
    }catch{}
   }
  }
 }
 function assertCurrent(epoch){
  if(!Number.isSafeInteger(epoch)||epoch<1)return false;
  try{return read()===epoch}catch{return false}
 }
 return {acquire,assertCurrent,current:read};
}
module.exports={openLocalEpochLedger};
