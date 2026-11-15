"use strict";
/**
 * Fail-closed anti-rollback gate for persisted revocation policies.
 * readMinimumSequence MUST come from a separately protected monotonic trust
 * anchor (e.g. TPM/KMS-backed counter). An ordinary adjacent file is NOT safe.
 * The anchor must be durable and updated before a policy is accepted.
 */
const {openPersistentRevocationStore}=require("./persistent-signed-revocation");
function openAnchoredRevocationStore(publicKey,directory,{readMinimumSequence,advanceMinimumSequence,clock}={}){
 if(typeof readMinimumSequence!=="function"||typeof advanceMinimumSequence!=="function")throw Error("External monotonic anchor required");
 function minimum(){
  const value=readMinimumSequence();
  if(!Number.isSafeInteger(value)||value<0)throw Error("Untrusted monotonic anchor");
  return value;
 }
 const store=openPersistentRevocationStore(publicKey,directory,{clock});
 function check(){
  const floor=minimum();
  if(store.sequence<floor)throw Error("Persisted policy rollback detected");
  if(store.sequence===0)throw Error("No trusted revocation policy");
  return store.fingerprints();
 }
 function apply(signed){
  // Refuse updates if the existing disk state has been rolled back.
  const floor=minimum();
  if(store.sequence<floor)throw Error("Persisted policy rollback detected");
  if(!signed||!Number.isSafeInteger(signed.sequence)||signed.sequence<=floor)throw Error("Policy below monotonic anchor");
  // Persist and verify first; then advance the external anchor. If anchor
  // advancement fails, do not expose the new policy to callers.
  store.apply(signed);
  try{advanceMinimumSequence(signed.sequence)}catch(e){throw Error("Monotonic anchor advancement failed: "+e.message)}
  if(minimum()<signed.sequence)throw Error("Monotonic anchor did not advance");
  return check()&&signed.sequence;
 }
 return {apply,fingerprints:check,get sequence(){check();return store.sequence}};
}
module.exports={openAnchoredRevocationStore};
