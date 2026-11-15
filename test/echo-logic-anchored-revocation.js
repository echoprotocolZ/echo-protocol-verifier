"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openAnchoredRevocationStore}=require("../scripts/echo-logic/anchored-revocation-policy");
describe("Echo Logic externally anchored revocation rollback protection",function(){
 let dir,keys,floor,clock;
 const now=1800000000000;
 beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-anchored-"));keys=crypto.generateKeyPairSync("ed25519");floor=0;clock=()=>now});
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const signed=(sequence,revokedFingerprints=[])=>signPolicy({version:1,sequence,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints},keys.privateKey);
 function open(){return openAnchoredRevocationStore(keys.publicKey,dir,{clock,readMinimumSequence:()=>floor,advanceMinimumSequence:n=>{if(n<=floor)throw Error("Counter rollback");floor=n}})}
 it("accepts a signed policy and survives restart with matching external counter",()=>{
  const a=open();a.apply(signed(1,["a".repeat(64)]));
  assert.equal(floor,1);
  assert.deepEqual(open().fingerprints(),["a".repeat(64)]);
 });
 it("detects restoration of an older valid signed policy file",()=>{
  const a=open();a.apply(signed(1,["a".repeat(64)]));
  const file=path.join(dir,"revocation-policy.json");
  const old=fs.readFileSync(file);
  a.apply(signed(2,["b".repeat(64)]));
  fs.writeFileSync(file,old);
  assert.throws(()=>open().fingerprints(),/rollback/);
 });
 it("rejects deleted policy file when external counter is ahead",()=>{
  open().apply(signed(1));
  fs.unlinkSync(path.join(dir,"revocation-policy.json"));
  assert.throws(()=>open().fingerprints(),/rollback/);
 });
 it("rejects a signed update below the external minimum",()=>{
  const a=open();a.apply(signed(3));
  assert.throws(()=>a.apply(signed(2)),/anchor/);
  assert.equal(floor,3);
 });
 it("fails closed if the external anchor is unavailable",()=>{
  const a=open();a.apply(signed(1));
  floor=-1;
  assert.throws(()=>a.fingerprints(),/anchor/);
 });
});
