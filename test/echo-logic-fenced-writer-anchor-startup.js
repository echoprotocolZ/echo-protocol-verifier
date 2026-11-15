"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openPersistentRevocationStore}=require("../scripts/echo-logic/persistent-signed-revocation");
const {openLocalEpochLedger}=require("../scripts/echo-logic/local-epoch-ledger");
const {openFencedRevocationWriter}=require("../scripts/echo-logic/fenced-revocation-writer");
describe("Echo Logic fenced writer rollback startup preflight",function(){
 let dir,keys,now,policyFloor,epochFloor,acquires,fence;
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-writer-anchor-"));
  keys=crypto.generateKeyPairSync("ed25519");now=1800000000000;policyFloor=0;epochFloor=0;acquires=0;
  fence={acquire(){return ++acquires},assertCurrent(e){return e===acquires}};
 });
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const signed=n=>signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey);
 const anchors=()=>({policyFloor:()=>policyFloor,epochFloor:()=>epochFloor});
 const open=()=>openFencedRevocationWriter(keys.publicKey,dir,{clock:()=>now,fence,rollbackAnchors:anchors()});
 it("opens a fenced writer with trusted zero floors",()=>{
  const writer=open();try{assert.equal(writer.epoch,1)}finally{writer.release()}
 });
 it("rejects signed policy rollback before acquiring an epoch or local writer lock",()=>{
  const store=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now});
  store.apply(signed(1));const old=fs.readFileSync(path.join(dir,"revocation-policy.json"));
  store.apply(signed(2));policyFloor=2;
  fs.writeFileSync(path.join(dir,"revocation-policy.json"),old);
  assert.throws(open,/Signed policy rollback detected/);
  assert.equal(acquires,0);assert.equal(fs.existsSync(path.join(dir,".revocation-writer.lock")),false);
 });
 it("rejects epoch rollback before acquiring a new epoch",()=>{
  const ledger=openLocalEpochLedger(dir);
  ledger.acquire();const old=fs.readFileSync(path.join(dir,"fencing-epoch.json"));
  ledger.acquire();epochFloor=2;
  fs.writeFileSync(path.join(dir,"fencing-epoch.json"),old);
  assert.throws(open,/Fencing epoch rollback detected/);assert.equal(acquires,0);
 });
 it("rejects malformed rollback anchor configuration before locking",()=>{
  assert.throws(()=>openFencedRevocationWriter(keys.publicKey,dir,{fence,rollbackAnchors:{}}),/Independent rollback anchors required/);
  assert.equal(acquires,0);assert.equal(fs.existsSync(path.join(dir,".revocation-writer.lock")),false);
 });
 it("allows a valid non-rollback persisted policy to reopen",()=>{
  const store=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now});
  store.apply(signed(1));policyFloor=1;
  const writer=open();try{assert.equal(writer.sequence,1)}finally{writer.release()}
 });
});
