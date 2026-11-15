"use strict";
/**
 * Signed revocation snapshots for local Echo Logic prototypes.
 * Ed25519 signature, monotonic sequence and bounded validity.
 * Trust anchor (publicKey) is provisioned out-of-band.
 */
const crypto=require("node:crypto");
const {checkCertificatePolicy}=require("./certificate-policy");
function canonical(snapshot){return JSON.stringify([snapshot.version,snapshot.sequence,snapshot.issuedAt,snapshot.expiresAt,snapshot.revokedFingerprints]);}
function validate(snapshot,now){
 if(!snapshot||snapshot.version!==1||!Number.isSafeInteger(snapshot.sequence)||snapshot.sequence<1)throw Error("Invalid policy version or sequence");
 if(!Number.isSafeInteger(snapshot.issuedAt)||!Number.isSafeInteger(snapshot.expiresAt)||snapshot.issuedAt>=snapshot.expiresAt)throw Error("Invalid policy validity");
 if(!Array.isArray(snapshot.revokedFingerprints)||snapshot.revokedFingerprints.length>10000)throw Error("Invalid policy entries");
 for(const fp of snapshot.revokedFingerprints)if(typeof fp!=="string"||!/^[0-9a-f]{64}$/.test(fp))throw Error("Invalid fingerprint");
 if(new Set(snapshot.revokedFingerprints).size!==snapshot.revokedFingerprints.length)throw Error("Duplicate fingerprint");
 if(now<snapshot.issuedAt||now>=snapshot.expiresAt)throw Error("Policy expired or not yet valid");
}
function signPolicy(snapshot,privateKey){return {...snapshot,signature:crypto.sign(null,Buffer.from(canonical(snapshot)),privateKey).toString("base64")}}
class SignedRevocationStore{
 constructor(publicKey,{clock=()=>Date.now()}={}){
  if(!publicKey)throw Error("Policy public key required");
  this.publicKey=publicKey;this.clock=clock;this.current=null;
 }
 apply(signed){
  const now=this.clock();
  validate(signed,now);
  if(this.current&&signed.sequence<=this.current.sequence)throw Error("Stale or replayed policy");
  if(typeof signed.signature!=="string"||!crypto.verify(null,Buffer.from(canonical(signed)),this.publicKey,Buffer.from(signed.signature,"base64")))throw Error("Invalid policy signature");
  this.current={version:signed.version,sequence:signed.sequence,issuedAt:signed.issuedAt,expiresAt:signed.expiresAt,revokedFingerprints:[...signed.revokedFingerprints]};
  return this.current.sequence;
 }
 fingerprints(){
  if(!this.current)throw Error("No trusted revocation policy");
  validate(this.current,this.clock());
  return [...this.current.revokedFingerprints];
 }
}
module.exports={SignedRevocationStore,signPolicy};
