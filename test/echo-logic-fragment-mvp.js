"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {createFragments,reconstruct}=require("../scripts/echo-logic/threshold-fragments");
const account="11".repeat(20),destination="22".repeat(20),checkpointCommitment="ab".repeat(32);
const context={account,destination,chainId:80002,checkpointCommitment,now:1000};
const payload=Buffer.from("Echo Protocol Z: threshold-fragment test payload");
function setup(k=3,n=5){
 return createFragments(payload,{threshold:k,total:n,account,destination,chainId:80002,checkpointCommitment,expiresAt:2000});
}
function recover(p,frags=p.shares,ctx=context){return reconstruct(p.manifest,p.manifestHash,frags,ctx)}
function rejects(name,fn){assert.throws(fn,undefined,name);console.log("PASS:",name)}
describe("Echo Logic local fragment transport MVP",function(){
 it("reconstructs any threshold subset and all fragments",function(){
  const p=setup();
  assert.deepEqual(recover(p,[p.shares[0],p.shares[2],p.shares[4]]),payload);
  assert.deepEqual(recover(p,p.shares),payload);
 });
 it("rejects missing, duplicated, and corrupted fragments",function(){
  const p=setup();
  rejects("fewer than k",()=>recover(p,p.shares.slice(0,2)));
  rejects("duplicate share",()=>recover(p,[p.shares[0],p.shares[0],p.shares[1]]));
  const damaged={...p.shares[0],data:Buffer.alloc(payload.length).toString("base64")};
  rejects("tampered share",()=>recover(p,[damaged,p.shares[1],p.shares[2]]));
 });
 it("rejects altered manifest, wrong context and expiry",function(){
  const p=setup();
  rejects("manifest tamper",()=>recover({...p,manifest:{...p.manifest,threshold:2}}));
  rejects("account",()=>recover(p,p.shares,{...context,account:"33".repeat(20)}));
  rejects("chain",()=>recover(p,p.shares,{...context,chainId:1}));
  rejects("destination",()=>recover(p,p.shares,{...context,destination:"33".repeat(20)}));
  rejects("checkpoint",()=>recover(p,p.shares,{...context,checkpointCommitment:"cd".repeat(32)}));
  rejects("expiry",()=>recover(p,p.shares,{...context,now:2000}));
 });
 it("round trips variable payloads and thresholds",function(){
  for(const n of [2,3,5,8])for(const k of [2,n]){
   const input=crypto.randomBytes(33);
   const p=createFragments(input,{threshold:k,total:n,account,destination,chainId:80002,checkpointCommitment,expiresAt:2000});
   assert.deepEqual(reconstruct(p.manifest,p.manifestHash,p.shares.slice(n-k),context),input);
  }
 });
});
