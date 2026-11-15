"use strict";
/**
 * Read-only lock recovery assessment. This module NEVER removes a lock.
 * Process existence alone cannot establish lock ownership (PID reuse).
 * Requires a trusted operator to fence all writers before manual recovery.
 */
const fs=require("node:fs");
const path=require("node:path");
function assessRevocationWriterLock(directory,{isProcessAlive=defaultProcessAlive}={}){
 if(typeof directory!=="string"||!directory)throw Error("Policy directory required");
 const lock=path.join(directory,".revocation-writer.lock");
 let stat;
 try{stat=fs.lstatSync(lock)}catch(e){
  if(e.code==="ENOENT")return {status:"unlocked",safeToRemove:false};
  return {status:"unknown",safeToRemove:false,reason:"Cannot inspect lock"};
 }
 if(!stat.isDirectory()||stat.isSymbolicLink())return {status:"unknown",safeToRemove:false,reason:"Unexpected lock type"};
 let owner;
 try{
  const file=path.join(lock,"owner.json");
  const info=fs.lstatSync(file);
  if(!info.isFile()||info.isSymbolicLink())throw Error("Unexpected owner type");
  owner=JSON.parse(fs.readFileSync(file,"utf8"));
 }catch{return {status:"unknown",safeToRemove:false,reason:"Missing or malformed owner metadata"}}
 if(!owner||!Number.isSafeInteger(owner.pid)||owner.pid<=0||typeof owner.token!=="string"||!/^[0-9a-f]{48}$/.test(owner.token))
  return {status:"unknown",safeToRemove:false,reason:"Invalid owner metadata"};
 let alive;
 try{alive=isProcessAlive(owner.pid)}catch{return {status:"unknown",safeToRemove:false,reason:"Cannot determine process state"}}
 if(typeof alive!=="boolean")return {status:"unknown",safeToRemove:false,reason:"Indeterminate process state"};
 return {status:alive?"owner-process-present":"owner-process-absent",pid:owner.pid,safeToRemove:false,
  reason:alive?"Process exists; PID identity is not authenticated":"Process absent; external fencing required before manual recovery"};
}
function defaultProcessAlive(pid){
 try{process.kill(pid,0);return true}
 catch(e){if(e.code==="ESRCH")return false;if(e.code==="EPERM")return true;throw e}
}
module.exports={assessRevocationWriterLock};
