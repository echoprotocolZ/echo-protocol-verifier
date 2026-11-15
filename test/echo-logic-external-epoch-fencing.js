"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openFencedRevocationWriter}=require("../scripts/echo-logic/fenced-revocation-writer");
describe("Echo Logic external epoch fencing",function(){
 let dir,keys,epoch,fence;const now=1800000000000;
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-fenced-"));
  keys=crypto.generateKeyPairSync("ed25519");epoch=0;
  fence={acquire(){return ++epoch},assertCurrent(value){return value===epoch}};
 });
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const open=()=>openFencedRevocationWriter(keys.publicKey,dir,{fence,clock:()=>now});
 const signed=n=>signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey);
 it("requires an explicit external fencing authority",()=>{
  assert.throws(()=>openFencedRevocationWriter(keys.publicKey,dir),/coordinator required/);
 });
 it("issues a positive epoch and accepts writes while current",()=>{
  const writer=open();
  try{assert.equal(writer.epoch,1);assert.equal(writer.apply(signed(1)),1)}
  finally{writer.release()}
 });
 it("rejects writes and reads after the coordinator revokes an epoch",()=>{
  const writer=open();writer.apply(signed(1));epoch++;
  assert.throws(()=>writer.apply(signed(2)),/epoch revoked/);
  assert.throws(()=>writer.fingerprints(),/epoch revoked/);
  assert.throws(()=>writer.sequence,/epoch revoked/);
  writer.release();
 });
 it("allows a new epoch after orderly handoff and rejects old writer reuse",()=>{
  const first=open();first.apply(signed(1));first.release();
  const second=open();
  try{assert.equal(second.epoch,2);assert.equal(second.apply(signed(2)),2);assert.throws(()=>first.apply(signed(3)),/released/)}
  finally{second.release()}
 });
 it("releases local lock if fencing acquisition is rejected",()=>{
  const bad={acquire(){return 0},assertCurrent(){return false}};
  assert.throws(()=>openFencedRevocationWriter(keys.publicKey,dir,{fence:bad}),/Invalid fencing epoch/);
  const writer=open();try{assert.equal(writer.epoch,1)}finally{writer.release()}
 });
});
