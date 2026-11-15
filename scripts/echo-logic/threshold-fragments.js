"use strict";
/**
 * Echo Logic local threshold-fragment MVP (NOT network routing, encryption,
 * location attestation, or production cryptography).
 * GF(256) Shamir sharing: any k distinct shares reconstruct; fewer than k
 * reveal no payload bytes if randomness is cryptographically sound.
 * Manifest/share hashes detect corruption, not malicious manifest substitution.
 */
const crypto=require("node:crypto");
const VERSION=1;
const hex=b=>Buffer.from(b).toString("hex");
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
function assertHex(s,n,label){if(typeof s!=="string"||!new RegExp("^[0-9a-fA-F]{"+n+"}$").test(s))throw Error(label+" must be "+n+" hex chars");return s.toLowerCase()}
function mul(a,b){let out=0;for(let i=0;i<8;i++){if(b&1)out^=a;const hi=a&128;a=(a<<1)&255;if(hi)a^=0x1b;b>>=1}return out}
function pow(a,n){let v=1;while(n){if(n&1)v=mul(v,a);a=mul(a,a);n>>=1}return v}
function div(a,b){if(!b)throw Error("GF divide by zero");return mul(a,pow(b,254))}
function manifestBytes(m){return Buffer.from(JSON.stringify([m.version,m.scheme,m.threshold,m.total,m.length,m.payloadHash,m.account,m.chainId,m.checkpointCommitment,m.destination,m.expiresAt,m.shareHashes]))}
function createFragments(payload,{threshold,total,account,chainId,checkpointCommitment,destination,expiresAt},randomBytes=crypto.randomBytes){
 if(!Buffer.isBuffer(payload)||payload.length===0||payload.length>1024*1024)throw Error("Payload must be 1..1048576 bytes");
 if(!Number.isInteger(threshold)||threshold<2||threshold>total||!Number.isInteger(total)||total>255)throw Error("Invalid k-of-n threshold");
 if(!Number.isSafeInteger(chainId)||chainId<1||!Number.isSafeInteger(expiresAt)||expiresAt<1)throw Error("Invalid chain/expiry");
 account=assertHex(account,40,"account");checkpointCommitment=assertHex(checkpointCommitment,64,"checkpoint");destination=assertHex(destination,40,"destination");
 const shares=Array.from({length:total},(_,i)=>({index:i+1,data:Buffer.alloc(payload.length)}));
 for(let j=0;j<payload.length;j++){
  const coeff=Buffer.from(randomBytes(threshold-1));
  if(coeff.length!==threshold-1)throw Error("Invalid randomness source");
  for(const s of shares){let v=coeff[coeff.length-1];for(let c=coeff.length-2;c>=0;c--)v=mul(v,s.index)^coeff[c];s.data[j]=mul(v,s.index)^payload[j]}
 }
 const manifest={version:VERSION,scheme:"shamir-gf256-v1",threshold,total,length:payload.length,payloadHash:sha(payload),account,chainId,checkpointCommitment,destination,expiresAt,shareHashes:shares.map(s=>sha(Buffer.concat([Buffer.from([s.index]),s.data])))};
 const manifestHash=sha(manifestBytes(manifest));
 return {manifest,manifestHash,shares:shares.map(s=>({index:s.index,data:s.data.toString("base64"),manifestHash}))};
}
function reconstruct(manifest,manifestHash,fragments,{account,chainId,checkpointCommitment,destination,now}){
 if(!manifest||manifest.version!==VERSION||manifest.scheme!=="shamir-gf256-v1")throw Error("Unsupported manifest");
 if(!Number.isInteger(manifest.threshold)||manifest.threshold<2||!Number.isInteger(manifest.total)||manifest.total<manifest.threshold||manifest.total>255||!Number.isInteger(manifest.length)||manifest.length<1||manifest.length>1048576||!Array.isArray(manifest.shareHashes)||manifest.shareHashes.length!==manifest.total)throw Error("Invalid manifest dimensions");
 if(sha(manifestBytes(manifest))!==manifestHash)throw Error("Manifest commitment mismatch");
 if(manifest.account!==assertHex(account,40,"account")||manifest.chainId!==chainId||manifest.checkpointCommitment!==assertHex(checkpointCommitment,64,"checkpoint")||manifest.destination!==assertHex(destination,40,"destination"))throw Error("Context binding mismatch");
 if(!Number.isSafeInteger(now)||now>=manifest.expiresAt)throw Error("Manifest expired");
 if(!Array.isArray(fragments)||fragments.length<manifest.threshold)throw Error("Insufficient fragments");
 const seen=new Set(),valid=[];
 for(const f of fragments){
  if(!Number.isInteger(f.index)||f.index<1||f.index>manifest.total||seen.has(f.index))throw Error("Duplicate/invalid fragment index");
  seen.add(f.index);
  if(f.manifestHash!==manifestHash||typeof f.data!=="string"||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.data))throw Error("Fragment binding/encoding mismatch");
  const bytes=Buffer.from(f.data,"base64");
  if(bytes.length!==manifest.length||bytes.toString("base64")!==f.data||sha(Buffer.concat([Buffer.from([f.index]),bytes]))!==manifest.shareHashes[f.index-1])throw Error("Fragment integrity mismatch");
  valid.push({index:f.index,bytes});
 }
 const selected=valid.slice(0,manifest.threshold),out=Buffer.alloc(manifest.length);
 for(let i=0;i<selected.length;i++){
  const xi=selected[i].index;let weight=1;
  for(let j=0;j<selected.length;j++){if(i===j)continue;const xj=selected[j].index;weight=mul(weight,div(xj,xi^xj))}
  for(let b=0;b<out.length;b++)out[b]^=mul(selected[i].bytes[b],weight);
 }
 if(sha(out)!==manifest.payloadHash)throw Error("Payload commitment mismatch");
 return out;
}
module.exports={createFragments,reconstruct};
