"use strict";
/**
 * Optional external fencing for Echo Logic's local exclusive policy writer.
 * The coordinator must issue strictly increasing epochs and reject stale
 * epochs atomically. In-memory coordinators are TEST-ONLY, not distributed.
 */
const {openExclusiveRevocationWriter}=require("./exclusive-revocation-writer");
const {assertRollbackAnchors}=require("./rollback-anchor-preflight");
function openFencedRevocationWriter(publicKey,directory,{fence,clock,rollbackAnchors,productionMode=false}={}){
 if(typeof productionMode!=="boolean")throw Error("Invalid production mode");
 if(productionMode&&(!rollbackAnchors||typeof rollbackAnchors.policyFloor!=="function"||typeof rollbackAnchors.epochFloor!=="function"))
  throw Error("Production fenced writer requires independent rollback anchors");
 if(!fence||typeof fence.acquire!=="function"||typeof fence.assertCurrent!=="function")
  throw Error("External fencing coordinator required");
 // Pin observed anchor floors within this process. A provider that later
 // reports a lower floor is rejected instead of silently weakening policy.
 let observedPolicyFloor=0,observedEpochFloor=0;
 const checkAnchors=()=>{
  if(rollbackAnchors===undefined)return;
  if(!rollbackAnchors||typeof rollbackAnchors.policyFloor!=="function"||typeof rollbackAnchors.epochFloor!=="function")
   throw Error("Independent rollback anchors required");
  const policyFloor=rollbackAnchors.policyFloor();
  const epochFloor=rollbackAnchors.epochFloor();
  if(!Number.isSafeInteger(policyFloor)||policyFloor<0)throw Error("Invalid trusted policy floor");
  if(!Number.isSafeInteger(epochFloor)||epochFloor<0)throw Error("Invalid trusted epoch floor");
  if(policyFloor<observedPolicyFloor||epochFloor<observedEpochFloor)
   throw Error("Trusted rollback anchor floor decreased");
  observedPolicyFloor=policyFloor;
  observedEpochFloor=epochFloor;
  return assertRollbackAnchors({directory,publicKey,clock,
   policyFloor:()=>policyFloor,epochFloor:()=>epochFloor});
 };
 checkAnchors();
 // Acquire the local lock first; a failed fence acquisition must release it.
 let epoch;
 const authorizeCommit=()=>{
  checkAnchors();
  if(epoch===undefined||fence.assertCurrent(epoch)!==true)throw Error("Fenced writer epoch revoked");
 };
 const writer=openExclusiveRevocationWriter(publicKey,directory,{clock,authorizeCommit,requireCommitAuthorization:true});
 try{
  epoch=fence.acquire();
  if(!Number.isSafeInteger(epoch)||epoch<1)throw Error("Invalid fencing epoch");
  if(fence.assertCurrent(epoch)!==true)throw Error("Fencing authority rejected epoch");
 }catch(e){writer.release();throw e}
 let closed=false;
 function check(){
  if(closed)throw Error("Fenced writer released");
  checkAnchors();
  if(fence.assertCurrent(epoch)!==true)throw Error("Fenced writer epoch revoked");
 }
 return {
  get epoch(){check();return epoch},
  apply(signed){check();return writer.apply(signed)},
  fingerprints(){check();return writer.fingerprints()},
  get sequence(){check();return writer.sequence},
  release(){if(closed)throw Error("Fenced writer released");writer.release();closed=true}
 };
}
module.exports={openFencedRevocationWriter};
