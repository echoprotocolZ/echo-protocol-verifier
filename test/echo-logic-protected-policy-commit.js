"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openPersistentRevocationStore}=require("../scripts/echo-logic/persistent-signed-revocation");
const {openFencedRevocationWriter}=require("../scripts/echo-logic/fenced-revocation-writer");
describe("Echo Logic protected policy commit authorization",function(){
 let dir,keys,now,epoch,fence;
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-protected-commit-"));
  keys=crypto.generateKeyPairSync("ed25519");now=1800000000000;epoch=0;
  fence={acquire(){return ++epoch},assertCurrent(e){return e===epoch}};
 });
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const signed=n=>signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey);
 const file=()=>path.join(dir,"revocation-policy.json");
 it("rejects protected store initialization without a commit authorizer",()=>{
  assert.throws(()=>openPersistentRevocationStore(keys.publicKey,dir,{requireCommitAuthorization:true}),/requires commit authorization/);
 });
 it("rejects an invalid authorizer in protected mode",()=>{
  assert.throws(()=>openPersistentRevocationStore(keys.publicKey,dir,{requireCommitAuthorization:true,authorizeCommit:true}),/requires commit authorization/);
 });
 it("accepts protected writes only with an authorizer that permits commit",()=>{
  let checks=0;
  const store=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now,requireCommitAuthorization:true,authorizeCommit:()=>{checks++}});
  assert.equal(store.apply(signed(1)),1);assert.equal(checks,2);
 });
 it("blocks a protected commit if the second authorization check revokes access",()=>{
  let checks=0;
  const store=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now,requireCommitAuthorization:true,authorizeCommit:()=>{if(++checks===2)throw Error("revoked")}});
  assert.throws(()=>store.apply(signed(1)),/revoked/);
  assert.equal(fs.existsSync(file()),false);
 });
 it("keeps fenced writer compatible with protected persistence",()=>{
  const writer=openFencedRevocationWriter(keys.publicKey,dir,{clock:()=>now,fence});
  try{assert.equal(writer.apply(signed(1)),1);epoch++;assert.throws(()=>writer.apply(signed(2)),/epoch revoked/);assert.equal(JSON.parse(fs.readFileSync(file(),"utf8")).sequence,1)}
  finally{writer.release()}
 });
});
