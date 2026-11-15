"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openPersistentRevocationStore}=require("../scripts/echo-logic/persistent-signed-revocation");
const {openFencedRevocationWriter}=require("../scripts/echo-logic/fenced-revocation-writer");
describe("Echo Logic persistence-boundary fencing",function(){
 let dir,keys,now,epoch,fence;
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-precommit-fence-"));
  keys=crypto.generateKeyPairSync("ed25519");now=1800000000000;epoch=0;
  fence={acquire(){return ++epoch},assertCurrent(e){return e===epoch}};
 });
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const signed=n=>signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey);
 const filename=()=>path.join(dir,"revocation-policy.json");
 it("rejects a persistence write when authorization is denied",()=>{
  const store=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now,authorizeCommit:()=>{throw Error("revoked")}});
  assert.throws(()=>store.apply(signed(1)),/revoked/);
  assert.equal(fs.existsSync(filename()),false);
 });
 it("rechecks fencing immediately before the on-disk commit",()=>{
  let checks=0;
  const store=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now,authorizeCommit:()=>{if(++checks===2)throw Error("revoked at commit")}});
  assert.throws(()=>store.apply(signed(1)),/revoked at commit/);
  assert.equal(checks,2);assert.equal(fs.existsSync(filename()),false);assert.equal(store.sequence,0);
 });
 it("allows a properly authorized signed policy to persist",()=>{
  const store=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now,authorizeCommit:()=>{}});
  assert.equal(store.apply(signed(1)),1);
  assert.equal(JSON.parse(fs.readFileSync(filename(),"utf8")).sequence,1);
 });
 it("rejects a fenced writer when epoch is revoked before applying",()=>{
  const writer=openFencedRevocationWriter(keys.publicKey,dir,{clock:()=>now,fence});
  epoch++;
  assert.throws(()=>writer.apply(signed(1)),/epoch revoked/);
  assert.equal(fs.existsSync(filename()),false);
  writer.release();
 });
 it("preserves existing signed policy if later commit authorization fails",()=>{
  let allowed=true;
  const store=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now,authorizeCommit:()=>{if(!allowed)throw Error("fence denied")}});
  store.apply(signed(1));allowed=false;
  assert.throws(()=>store.apply(signed(2)),/fence denied/);
  assert.equal(store.sequence,1);assert.equal(JSON.parse(fs.readFileSync(filename(),"utf8")).sequence,1);
 });
});
