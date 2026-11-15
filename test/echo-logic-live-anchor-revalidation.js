"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openFencedRevocationWriter}=require("../scripts/echo-logic/fenced-revocation-writer");
describe("Echo Logic live rollback anchor revalidation",function(){
 let dir,keys,now,epoch,policyFloor,epochFloor,fence,anchors;
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-live-anchor-"));
  keys=crypto.generateKeyPairSync("ed25519");now=1800000000000;epoch=0;policyFloor=0;epochFloor=0;
  fence={acquire(){return ++epoch},assertCurrent:e=>e===epoch};
  anchors={policyFloor:()=>policyFloor,epochFloor:()=>epochFloor};
 });
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const signed=n=>signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey);
 const open=()=>openFencedRevocationWriter(keys.publicKey,dir,{clock:()=>now,fence,productionMode:true,rollbackAnchors:anchors});
 it("permits an authorized write while trusted floors remain satisfied",()=>{
  const writer=open();try{assert.equal(writer.apply(signed(1)),1)}finally{writer.release()}
 });
 it("rejects writes after trusted policy floor advances beyond persisted state",()=>{
  const writer=open();try{writer.apply(signed(1));policyFloor=2;assert.throws(()=>writer.apply(signed(2)),/Signed policy rollback detected/);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,"revocation-policy.json"),"utf8")).sequence,1)}finally{writer.release()}
 });
 it("rejects reads after trusted epoch floor advances beyond local state",()=>{
  const writer=open();try{writer.apply(signed(1));epochFloor=1;assert.throws(()=>writer.fingerprints(),/Fencing epoch rollback detected/)}finally{writer.release()}
 });
 it("rejects writes after a previously valid policy file is removed",()=>{
  const writer=open();try{writer.apply(signed(1));policyFloor=1;fs.unlinkSync(path.join(dir,"revocation-policy.json"));assert.throws(()=>writer.apply(signed(2)),/Signed policy rollback detected/)}finally{writer.release()}
 });
 it("rejects invalid trusted floor values introduced after startup",()=>{
  const writer=open();try{policyFloor=-1;assert.throws(()=>writer.apply(signed(1)),/Invalid trusted policy floor/)}finally{writer.release()}
 });
 it("rejects a policy floor that decreases after a previously observed high-water mark",()=>{
  const writer=open();try{
   writer.apply(signed(1));
   policyFloor=1;writer.fingerprints();
   policyFloor=0;
   assert.throws(()=>writer.apply(signed(2)),/Trusted rollback anchor floor decreased/);
   assert.equal(JSON.parse(fs.readFileSync(path.join(dir,"revocation-policy.json"),"utf8")).sequence,1);
  }finally{writer.release()}
 });
 it("rejects an epoch floor that decreases during the same writer session",()=>{
  const writer=open();try{
   writer.apply(signed(1));
   epochFloor=1;
   assert.throws(()=>writer.fingerprints(),/Fencing epoch rollback detected/);
  }finally{writer.release()}
 });

 it("rejects a decreasing epoch floor after a valid nonzero floor is observed",()=>{
  // The external coordinator is responsible for persisting its epoch.
  fs.writeFileSync(path.join(dir,"fencing-epoch.json"),JSON.stringify({version:1,epoch:1}));
  const writer=open();try{
   writer.apply(signed(1));
   epochFloor=1;writer.fingerprints();
   epochFloor=0;
   assert.throws(()=>writer.fingerprints(),/Trusted rollback anchor floor decreased/);
  }finally{writer.release()}
 });
 it("rejects an invalid epoch floor introduced after startup",()=>{
  const writer=open();try{
   epochFloor=Number.NaN;
   assert.throws(()=>writer.apply(signed(1)),/Invalid trusted epoch floor/);
  }finally{writer.release()}
 });
 it("does not accept anchor-provider regression after a failed high-floor check",()=>{
  const writer=open();try{
   writer.apply(signed(1));
   policyFloor=3;
   assert.throws(()=>writer.fingerprints(),/Signed policy rollback detected/);
   policyFloor=0;
   assert.throws(()=>writer.apply(signed(2)),/Trusted rollback anchor floor decreased/);
  }finally{writer.release()}
 });

});
