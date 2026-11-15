"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openPersistentRevocationStore}=require("../scripts/echo-logic/persistent-signed-revocation");
describe("Echo Logic persistent signed revocation policy",function(){
 let dir,keys;const now=1800000000000,clock=()=>now;
 const policy=(sequence,revokedFingerprints=[])=>({version:1,sequence,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints});
 const signed=(seq,items=[])=>signPolicy(policy(seq,items),keys.privateKey);
 beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-policy-durable-"));keys=crypto.generateKeyPairSync("ed25519")});
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const open=()=>openPersistentRevocationStore(keys.publicKey,dir,{clock});
 it("restores a verified policy after restart",()=>{
  const a=open();a.apply(signed(1,["a".repeat(64)]));
  const b=open();assert.equal(b.sequence,1);assert.deepEqual(b.fingerprints(),["a".repeat(64)]);
 });
 it("rejects replay and rollback after restart",()=>{
  open().apply(signed(3));
  const b=open();
  assert.throws(()=>b.apply(signed(2)),/Stale/);
  assert.throws(()=>b.apply(signed(3)),/Stale/);
  b.apply(signed(4));assert.equal(open().sequence,4);
 });
 it("rejects corrupted persisted policy instead of silently resetting",()=>{
  open().apply(signed(1));
  fs.writeFileSync(path.join(dir,"revocation-policy.json"),"{bad json");
  assert.throws(()=>open(),/Corrupted/);
 });
 it("rejects tampered persisted policy and unauthorized replacement",()=>{
  open().apply(signed(1,["a".repeat(64)]));
  const file=path.join(dir,"revocation-policy.json");
  const altered=JSON.parse(fs.readFileSync(file,"utf8"));
  altered.revokedFingerprints=["b".repeat(64)];
  fs.writeFileSync(file,JSON.stringify(altered));
  assert.throws(()=>open(),/Invalid or expired/);
 });
 it("preserves valid disk state after rejecting an invalid update",()=>{
  const a=open();a.apply(signed(1));
  const bad={...signed(2),revokedFingerprints:["c".repeat(64)]};
  assert.throws(()=>a.apply(bad),/signature/);
  assert.equal(open().sequence,1);
 });
});
