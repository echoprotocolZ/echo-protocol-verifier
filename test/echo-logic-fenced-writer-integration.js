"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openFencedRevocationWriter}=require("../scripts/echo-logic/fenced-revocation-writer");
describe("Echo Logic fenced writer integration boundaries",function(){
 let dir,keys,now,issued,policyFloor,epochFloor,epoch,fence,anchors;
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-fence-integration-"));
  keys=crypto.generateKeyPairSync("ed25519");now=1800000000000;
  issued=0;policyFloor=0;epochFloor=0;epoch=0;
  fence={acquire:()=>{epoch=++issued;return epoch},assertCurrent:e=>e===epoch};
  anchors={policyFloor:()=>policyFloor,epochFloor:()=>epochFloor};
 });
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const signed=n=>signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey);
 const open=()=>openFencedRevocationWriter(keys.publicKey,dir,{clock:()=>now,fence,rollbackAnchors:anchors,productionMode:true});
 const sequence=()=>JSON.parse(fs.readFileSync(path.join(dir,"revocation-policy.json"),"utf8")).sequence;
 it("persists signed policy across fenced writer sessions",()=>{
  const first=open();try{assert.equal(first.apply(signed(1)),1)}finally{first.release()}
  policyFloor=1;
  const second=open();try{assert.equal(second.sequence,1);assert.equal(second.apply(signed(2)),2)}finally{second.release()}
  assert.equal(sequence(),2);
 });
 it("rejects a second local writer without modifying persisted policy",()=>{
  const first=open();try{
   first.apply(signed(1));
   assert.throws(()=>open(),/lock already held/);
   assert.equal(sequence(),1);
  }finally{first.release()}
 });
 it("rejects a revoked coordinator epoch before committing",()=>{
  const writer=open();try{
   writer.apply(signed(1));epoch++;
   assert.throws(()=>writer.apply(signed(2)),/epoch revoked/);
   assert.equal(sequence(),1);
  }finally{writer.release()}
 });
 it("fails closed when independent policy floor is ahead of disk on reopen",()=>{
  const first=open();try{first.apply(signed(1))}finally{first.release()}
  policyFloor=2;
  assert.throws(()=>open(),/Signed policy rollback detected/);
  assert.equal(sequence(),1);
 });
 it("fails closed when persisted signed policy is deleted before reopen",()=>{
  const first=open();try{first.apply(signed(1))}finally{first.release()}
  policyFloor=1;fs.unlinkSync(path.join(dir,"revocation-policy.json"));
  assert.throws(()=>open(),/Signed policy rollback detected/);
 });
 it("rejects an unauthorized coordinator epoch at writer startup",()=>{
  fence.assertCurrent=()=>false;
  assert.throws(()=>open(),/Fencing authority rejected epoch/);
  assert.equal(fs.existsSync(path.join(dir,".revocation-writer.lock")),false);
 });
});
