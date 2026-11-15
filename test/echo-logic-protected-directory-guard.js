"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openPersistentRevocationStore}=require("../scripts/echo-logic/persistent-signed-revocation");
describe("Echo Logic protected directory downgrade guard",function(){
 let dir,keys,now;
 beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-guard-"));keys=crypto.generateKeyPairSync("ed25519");now=1800000000000});
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const signed=n=>signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey);
 const options=()=>({clock:()=>now,requireCommitAuthorization:true,authorizeCommit:()=>{}});
 const guard=()=>path.join(dir,".protected-revocation-policy");
 it("creates a durable guard when protected storage initializes",()=>{
  const store=openPersistentRevocationStore(keys.publicKey,dir,options());
  assert.equal(fs.readFileSync(guard(),"utf8"),"echo-policy-protected-v1\n");
  assert.equal(store.apply(signed(1)),1);
 });
 it("refuses legacy unprotected reopen after protection enabled",()=>{
  openPersistentRevocationStore(keys.publicKey,dir,options());
  assert.throws(()=>openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now}),/requires commit authorization/);
 });
 it("refuses writes from legacy handle opened before protection",()=>{
  const legacy=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now});
  openPersistentRevocationStore(keys.publicKey,dir,options());
  assert.throws(()=>legacy.apply(signed(1)),/requires commit authorization/);
 });
 it("fails closed when a protection guard is corrupted",()=>{
  openPersistentRevocationStore(keys.publicKey,dir,options());
  fs.writeFileSync(guard(),"tampered");
  assert.throws(()=>openPersistentRevocationStore(keys.publicKey,dir,options()),/Invalid policy protection guard/);
 });
 it("refuses protected writes after guard is removed",()=>{
  const store=openPersistentRevocationStore(keys.publicKey,dir,options());
  fs.unlinkSync(guard());
  assert.throws(()=>store.apply(signed(1)),/guard missing/);
 });
});
