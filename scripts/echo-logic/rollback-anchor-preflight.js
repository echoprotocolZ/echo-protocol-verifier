"use strict";
/**
 * Fail-closed startup preflight against independent, trusted monotonic anchors.
 * Anchors MUST live outside the writable/rollbackable policy directory.
 * This is detection only, not atomic fencing or a replacement for a transactional authority.
 */
const fs=require("node:fs");
const path=require("node:path");
const {SignedRevocationStore}=require("./signed-revocation-policy");
function validFloor(value,name){
 if(!Number.isSafeInteger(value)||value<0)throw Error("Invalid trusted "+name+" floor");
 return value;
}
function assertRollbackAnchors({directory,publicKey,clock=()=>Date.now(),policyFloor,epochFloor}={}){
 if(typeof directory!=="string"||!directory)throw Error("Directory required");
 if(typeof policyFloor!=="function"||typeof epochFloor!=="function")
  throw Error("Independent trusted policy and epoch anchors required");
 // Never accept caller-provided filesystem paths as trusted anchors.
 const minPolicy=validFloor(policyFloor(),"policy");
 const minEpoch=validFloor(epochFloor(),"epoch");
 let sequence=0,epoch=0;
 const policyPath=path.join(directory,"revocation-policy.json");
 try{
  const record=JSON.parse(fs.readFileSync(policyPath,"utf8"));
  const store=new SignedRevocationStore(publicKey,{clock});
  store.apply(record);
  sequence=store.current.sequence;
 }catch(e){
  if(e.code!=="ENOENT")throw Error("Policy anchor preflight failed: "+e.message);
 }
 if(sequence<minPolicy)throw Error("Signed policy rollback detected");
 const epochPath=path.join(directory,"fencing-epoch.json");
 try{
  const record=JSON.parse(fs.readFileSync(epochPath,"utf8"));
  if(!record||record.version!==1||!Number.isSafeInteger(record.epoch)||record.epoch<1)
   throw Error("Invalid epoch record");
  epoch=record.epoch;
 }catch(e){
  if(e.code!=="ENOENT")throw Error("Epoch anchor preflight failed: "+e.message);
 }
 if(epoch<minEpoch)throw Error("Fencing epoch rollback detected");
 return Object.freeze({sequence,epoch});
}
module.exports={assertRollbackAnchors};
