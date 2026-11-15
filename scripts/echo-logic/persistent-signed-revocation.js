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
 // Cooperative downgrade guard: once enabled, legacy callers cannot write.
 // Not a defense against malicious filesystem actors or atomic fencing.
 const guard=path.join(directory,".protected-revocation-policy");
 function guardPresent(){
  let stat;
  try{stat=fs.lstatSync(guard)}catch(e){if(e.code==="ENOENT")return false;throw Error("Policy protection guard unreadable")}
  if(!stat.isFile()||stat.isSymbolicLink())throw Error("Invalid policy protection guard");
  let value;
  try{value=fs.readFileSync(guard,"utf8")}catch{throw Error("Policy protection guard unreadable")}
  if(value!=="echo-policy-protected-v1\\n")throw Error("Invalid policy protection guard");
  return true;
 }
 if(requireCommitAuthorization){
  if(!guardPresent()){
   let fd;
   try{
    fd=fs.openSync(guard,"wx",0o600);
    fs.writeFileSync(fd,"echo-policy-protected-v1\\n");
    fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    const dfd=fs.openSync(directory,"r");
    try{fs.fsyncSync(dfd)}finally{fs.closeSync(dfd)}
   }catch(e){
    if(fd!==undefined)fs.closeSync(fd);
    throw Error("Policy protection initialization failed: "+e.message);
   }
  }
 }else if(guardPresent())throw Error("Protected policy directory requires commit authorization");
 function ensureProtection(){
  const present=guardPresent();
  if(requireCommitAuthorization&&!present)throw Error("Policy protection guard missing");
  if(!requireCommitAuthorization&&present)throw Error("Protected policy directory requires commit authorization");
 }
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
  ensureProtection();
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
   ensureProtection();
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
