"use strict";
/**
 * Optional external fencing for Echo Logic's local exclusive policy writer.
 * The coordinator must issue strictly increasing epochs and reject stale
 * epochs atomically. In-memory coordinators are TEST-ONLY, not distributed.
 */
const {openExclusiveRevocationWriter}=require("./exclusive-revocation-writer");
function openFencedRevocationWriter(publicKey,directory,{fence,clock}={}){
 if(!fence||typeof fence.acquire!=="function"||typeof fence.assertCurrent!=="function")
  throw Error("External fencing coordinator required");
 // Acquire the local lock first; a failed fence acquisition must release it.
 let epoch;
 const authorizeCommit=()=>{
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
