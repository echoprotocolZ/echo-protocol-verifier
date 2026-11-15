"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openPersistentRevocationStore}=require("../scripts/echo-logic/persistent-signed-revocation");
const {openExclusiveRevocationWriter}=require("../scripts/echo-logic/exclusive-revocation-writer");
const {openLocalEpochLedger}=require("../scripts/echo-logic/local-epoch-ledger");
describe("Echo Logic concurrency and rollback threat characterization",function(){
 let dir,keys,now;
 beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-rollback-"));keys=crypto.generateKeyPairSync("ed25519");now=1800000000000});
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const signed=n=>signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey);
 const policy=()=>path.join(dir,"revocation-policy.json");
 const guard=()=>path.join(dir,".protected-revocation-policy");
 const opts=()=>({clock:()=>now,requireCommitAuthorization:true,authorizeCommit:()=>{}});
 it("blocks a competing local writer while the first writer owns the lock",()=>{
  const writer=openExclusiveRevocationWriter(keys.publicKey,dir,{clock:()=>now});
  try{assert.throws(()=>openExclusiveRevocationWriter(keys.publicKey,dir,{clock:()=>now}),/lock already held/)}
  finally{writer.release()}
 });
 it("rejects a replaced malformed protection marker",()=>{
  const store=openPersistentRevocationStore(keys.publicKey,dir,opts());
  const replacement=path.join(dir,"replacement");
  fs.writeFileSync(replacement,"forged guard");
  fs.renameSync(replacement,guard());
  assert.throws(()=>store.apply(signed(1)),/Invalid policy protection guard/);
 });
 it("characterizes valid signed policy rollback after reopening as a known vulnerability",()=>{
  const store=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now});
  store.apply(signed(1));
  const old=fs.readFileSync(policy());
  store.apply(signed(2));
  fs.writeFileSync(policy(),old);
  const reopened=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now});
  // KNOWN GAP: no external high-water sequence anchor; older valid signature is accepted.
  assert.equal(reopened.sequence,1);
 });
 it("characterizes durable epoch file rollback as a known vulnerability",()=>{
  const ledger=openLocalEpochLedger(dir);
  assert.equal(ledger.acquire(),1);
  const old=fs.readFileSync(path.join(dir,"fencing-epoch.json"));
  assert.equal(ledger.acquire(),2);
  fs.writeFileSync(path.join(dir,"fencing-epoch.json"),old);
  // KNOWN GAP: a valid older record can reauthorize an old epoch without an external anchor.
  assert.equal(ledger.assertCurrent(1),true);
 });
 it("characterizes removal of a protection marker before legacy reopen as a known vulnerability",()=>{
  const store=openPersistentRevocationStore(keys.publicKey,dir,opts());
  store.apply(signed(1));
  fs.unlinkSync(guard());
  // KNOWN GAP: a caller with directory write permission can erase the opt-in marker.
  const legacy=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now});
  assert.equal(legacy.apply(signed(2)),2);
 });
});
