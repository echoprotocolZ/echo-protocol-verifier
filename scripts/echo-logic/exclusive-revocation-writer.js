"use strict";
/**
 * Exclusive local writer ownership for Echo Logic policy stores.
 * mkdir is atomic on a supported local filesystem. No automatic stale-lock
 * breaking: PID checks are advisory and PID reuse makes them unsafe.
 * Not a distributed lock, network filesystem lock, or hostile-user boundary.
 */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {openPersistentRevocationStore}=require("./persistent-signed-revocation");
function openExclusiveRevocationWriter(publicKey,directory,options={}){
 if(typeof directory!=="string"||!directory)throw Error("Policy directory required");
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const lock=path.join(directory,".revocation-writer.lock");
 const token=crypto.randomBytes(24).toString("hex");
 try{fs.mkdirSync(lock,{mode:0o700})}catch(e){
  if(e.code==="EEXIST")throw Error("Revocation writer lock already held; manual recovery required");
  throw e;
 }
 let released=false,store;
 try{
  fs.writeFileSync(path.join(lock,"owner.json"),JSON.stringify({pid:process.pid,token}),{flag:"wx",mode:0o600});
  store=openPersistentRevocationStore(publicKey,directory,options);
 }catch(e){
  // Only remove our own lock if initialization fails.
  try{
   const owner=JSON.parse(fs.readFileSync(path.join(lock,"owner.json"),"utf8"));
   if(owner.token===token)fs.rmSync(lock,{recursive:true});
  }catch{}
  throw e;
 }
 function verify(){
  if(released)throw Error("Revocation writer released");
  let owner;
  try{owner=JSON.parse(fs.readFileSync(path.join(lock,"owner.json"),"utf8"))}catch{throw Error("Revocation writer ownership lost")}
  if(owner.token!==token)throw Error("Revocation writer ownership lost");
 }
 function release(){
  verify();
  // Verify before removal. Concurrent malicious replacement is out of scope.
  fs.rmSync(lock,{recursive:true});
  released=true;
 }
 return {apply(signed){verify();return store.apply(signed)},fingerprints(){verify();return store.fingerprints()},get sequence(){verify();return store.sequence},release};
}
module.exports={openExclusiveRevocationWriter};
