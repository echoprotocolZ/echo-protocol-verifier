"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openExclusiveRevocationWriter}=require("../scripts/echo-logic/exclusive-revocation-writer");
describe("Echo Logic exclusive revocation writer",function(){
 let dir,keys;const now=1800000000000;
 beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-writer-lock-"));keys=crypto.generateKeyPairSync("ed25519")});
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const open=()=>openExclusiveRevocationWriter(keys.publicKey,dir,{clock:()=>now});
 const signed=n=>signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey);
 it("allows one writer and rejects a second writer",()=>{
  const first=open();
  try{assert.throws(()=>open(),/lock already held/);first.apply(signed(1));assert.equal(first.sequence,1)}
  finally{first.release()}
 });
 it("allows another writer after an orderly release",()=>{
  const first=open();first.apply(signed(1));first.release();
  const second=open();
  try{second.apply(signed(2));assert.equal(second.sequence,2)}
  finally{second.release()}
 });
 it("refuses a stale lock rather than guessing whether it is safe to break",()=>{
  fs.mkdirSync(path.join(dir,".revocation-writer.lock"));
  assert.throws(()=>open(),/manual recovery required/);
 });
 it("detects ownership token tampering and fails closed",()=>{
  const writer=open();
  const owner=path.join(dir,".revocation-writer.lock","owner.json");
  fs.writeFileSync(owner,JSON.stringify({pid:process.pid,token:"attacker"}));
  assert.throws(()=>writer.apply(signed(1)),/ownership lost/);
  assert.throws(()=>writer.fingerprints(),/ownership lost/);
 });
 it("rejects writes after release",()=>{
  const writer=open();writer.release();
  assert.throws(()=>writer.apply(signed(1)),/released/);
 });
});
