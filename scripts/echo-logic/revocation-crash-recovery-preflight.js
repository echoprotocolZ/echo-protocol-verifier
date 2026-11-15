"use strict";
/**
 * Crash-recovery preflight. No lock deletion is performed here.
 * An external coordinator must fence all prior writers before an operator
 * removes a stale lock; PID absence is not proof of fencing.
 */
const fs=require("node:fs");
const path=require("node:path");
const {assessRevocationWriterLock}=require("./revocation-lock-recovery-assessment");
function recoveryPreflight(directory,{isProcessAlive}={}){
 const assessment=assessRevocationWriterLock(directory,{isProcessAlive});
 const lockPath=path.join(directory,".revocation-writer.lock");
 const policyPath=path.join(directory,"revocation-policy.json");
 let policyStatus="absent";
 try{
  const stat=fs.lstatSync(policyPath);
  if(!stat.isFile()||stat.isSymbolicLink())policyStatus="unsafe-type";
  else{
   try{
    const record=JSON.parse(fs.readFileSync(policyPath,"utf8"));
    policyStatus=record&&typeof record==="object"&&!Array.isArray(record)?"unverified":"malformed";
   }catch{policyStatus="malformed"}
  }
 }catch(e){if(e.code!=="ENOENT")policyStatus="unreadable"}
 return {
  lockStatus:assessment.status,
  policyStatus,
  mayAutomaticallyRecover:false,
  mayResumeWriting:assessment.status==="unlocked"&&policyStatus!=="malformed"&&policyStatus!=="unsafe-type"&&policyStatus!=="unreadable",
  requiresExternalFencing:assessment.status!=="unlocked",
  lockPath,
  reason:"Preflight never removes locks or authenticates signed policy; open the signed store to verify before serving traffic"
 };
}
module.exports={recoveryPreflight};
