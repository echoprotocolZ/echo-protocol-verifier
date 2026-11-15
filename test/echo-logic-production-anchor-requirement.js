"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openPersistentRevocationStore}=require("../scripts/echo-logic/persistent-signed-revocation");
const {openFencedRevocationWriter}=require("../scripts/echo-logic/fenced-revocation-writer");
describe("Echo Logic production-mode rollback anchor requirement",function(){
 let dir,keys,now,acquires,fence;
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-prod-anchors-"));
  keys=crypto.generateKeyPairSync("ed25519");now=1800000000000;acquires=0;
  fence={acquire(){return ++acquires},assertCurrent:e=>e===acquires};
 });
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const signed=n=>signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey);
 const open=options=>openFencedRevocationWriter(keys.publicKey,dir,{clock:()=>now,fence,productionMode:true,...options});
 const anchors=(policy=0,epoch=0)=>({policyFloor:()=>policy,epochFloor:()=>epoch});
 it("refuses production startup without independent anchors",()=>{
  assert.throws(()=>open(),/Production fenced writer requires independent rollback anchors/);
  assert.equal(acquires,0);
 });
 it("rejects incomplete anchor providers before locking",()=>{
  assert.throws(()=>open({rollbackAnchors:{policyFloor:()=>0}}),/Production fenced writer requires independent rollback anchors/);
  assert.equal(fs.existsSync(path.join(dir,".revocation-writer.lock")),false);
 });
 it("accepts complete trusted anchors in explicit production mode",()=>{
  const writer=open({rollbackAnchors:anchors()});
  try{assert.equal(writer.epoch,1)}finally{writer.release()}
 });
 it("rejects a signed policy below the trusted floor in production mode",()=>{
  const store=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now});
  store.apply(signed(1));
  assert.throws(()=>open({rollbackAnchors:anchors(2,0)}),/Signed policy rollback detected/);
  assert.equal(acquires,0);
 });
 it("rejects a missing epoch below the trusted floor in production mode",()=>{
  assert.throws(()=>open({rollbackAnchors:anchors(0,1)}),/Fencing epoch rollback detected/);
  assert.equal(acquires,0);
 });
});
