"use strict";
/**
 * Durable replay guard for localhost development.
 * Uses exclusive per-message files, surviving process restarts.
 * Directory must be private and on a filesystem supporting atomic O_EXCL.
 */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
function createReplayGuard(directory){
 if(typeof directory!=="string"||!directory)throw Error("Replay directory required");
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const stat=fs.lstatSync(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error("Invalid replay directory");
 return {
  claim(relayId,messageId){
   if(typeof relayId!=="string"||!relayId||typeof messageId!=="string"||!/^[0-9a-f]{32}$/.test(messageId))throw Error("Invalid replay identity");
   const id=crypto.createHash("sha256").update(JSON.stringify([relayId,messageId])).digest("hex");
   const file=path.join(directory,id);
   try{
    const fd=fs.openSync(file,"wx",0o600);
    try{fs.writeSync(fd,JSON.stringify({relayId,messageId}))}finally{fs.closeSync(fd)}
    return true;
   }catch(e){if(e.code==="EEXIST")return false;throw e}
  }
 };
}
module.exports={createReplayGuard};
