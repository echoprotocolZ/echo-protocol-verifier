"use strict";
/* Local durable signed policy state. Single writer per directory; no network filesystem guarantees. */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {SignedRevocationStore}=require("./signed-revocation-policy");
function openPersistentRevocationStore(publicKey,directory,{clock=()=>Date.now(),authorizeCommit,requireCommitAuthorization=false}={}){
 if(requireCommitAuthorization&&typeof authorizeCommit!=="function")throw Error("Protected policy store requires commit authorization");
 if(authorizeCommit!==undefined&&typeof authorizeCommit!=="function")throw Error("Invalid commit authorization hook");
 if(!directory||typeof directory!=="string")throw Error("Policy directory required");
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const filename=path.join(directory,"revocation-policy.json");
 const store=new SignedRevocationStore(publicKey,{clock});
 let last=null;
 let uncertain=false;
 function ensureCertain(){if(uncertain)throw Error("Policy persistence uncertain; reopen store") }
 if(fs.existsSync(filename)){
  let record;
  try{record=JSON.parse(fs.readFileSync(filename,"utf8"))}catch{throw Error("Corrupted persisted policy")}
  try{
   if(!record||typeof record!=="object")throw Error("Bad record");
   store.apply(record);
   last=record;
  }catch{throw Error("Invalid or expired persisted policy")}
 }
 function apply(signed){
  ensureCertain();
  if(authorizeCommit)authorizeCommit();
  // Verify in a temporary store before touching disk or active state.
  const candidate=new SignedRevocationStore(publicKey,{clock});
  if(last)candidate.apply(last);
  candidate.apply(signed);
  const tmp=path.join(directory,".revocation-"+crypto.randomBytes(12).toString("hex")+".tmp");
  let fd,renamed=false;
  try{
   fd=fs.openSync(tmp,"wx",0o600);
   fs.writeFileSync(fd,JSON.stringify(signed));
   fs.fsyncSync(fd);
   fs.closeSync(fd);fd=undefined;
   // Recheck immediately before commit; not atomic with the rename.
   if(authorizeCommit)authorizeCommit();
   fs.renameSync(tmp,filename);renamed=true;
   const dirfd=fs.openSync(directory,"r");
   try{fs.fsyncSync(dirfd)}finally{fs.closeSync(dirfd)}
  }catch(e){
   if(fd!==undefined)fs.closeSync(fd);
   try{fs.unlinkSync(tmp)}catch{}
   if(renamed)uncertain=true;
   throw Error((renamed?"Policy persistence uncertain; reopen store: ":"Policy persistence failed: ")+e.message);
  }
  // Disk commit happened before updating in-memory policy.
  store.apply(signed);last=signed;
  return store.current.sequence;
 }
 return {apply,fingerprints:()=>{ensureCertain();return store.fingerprints()},get sequence(){ensureCertain();return store.current?.sequence??0}};
}
module.exports={openPersistentRevocationStore};
