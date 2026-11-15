"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openPersistentRevocationStore}=require("../scripts/echo-logic/persistent-signed-revocation");
describe("Echo Logic crash-safe revocation persistence",function(){
 let dir,keys;const now=1800000000000,clock=()=>now;
 beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-crash-safe-"));keys=crypto.generateKeyPairSync("ed25519")});
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const signed=n=>signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey);
 const open=()=>openPersistentRevocationStore(keys.publicKey,dir,{clock});
 it("rejects invalid updates without changing persisted state",()=>{
  const s=open();s.apply(signed(1));
  const bad={...signed(2),sequence:3};
  assert.throws(()=>s.apply(bad),/signature/);
  assert.equal(s.sequence,1);assert.equal(open().sequence,1);
 });
 it("fails closed after directory sync fails following atomic rename",()=>{
  const s=open();s.apply(signed(1));
  const original=fs.fsyncSync;let calls=0;
  fs.fsyncSync=function(fd){calls++;if(calls===2)throw Error("injected directory sync failure");return original(fd)};
  try{assert.throws(()=>s.apply(signed(2)),/uncertain/)}finally{fs.fsyncSync=original}
  assert.throws(()=>s.fingerprints(),/uncertain/);
  assert.throws(()=>s.apply(signed(3)),/uncertain/);
  assert.equal(open().sequence,2);
 });
 it("keeps old policy usable when write fails before rename",()=>{
  const s=open();s.apply(signed(1));
  const original=fs.renameSync;
  fs.renameSync=()=>{throw Error("injected rename failure")};
  try{assert.throws(()=>s.apply(signed(2)),/persistence failed/)}finally{fs.renameSync=original}
  assert.equal(s.sequence,1);assert.equal(open().sequence,1);
 });
 it("rejects corrupted persisted state after restart",()=>{
  open().apply(signed(1));
  fs.writeFileSync(path.join(dir,"revocation-policy.json"),"truncated");
  assert.throws(()=>open(),/Corrupted/);
 });
});
