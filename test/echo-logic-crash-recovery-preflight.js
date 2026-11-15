"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {recoveryPreflight}=require("../scripts/echo-logic/revocation-crash-recovery-preflight");
const {openExclusiveRevocationWriter}=require("../scripts/echo-logic/exclusive-revocation-writer");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
describe("Echo Logic controlled crash recovery preflight",function(){
 let dir,keys;const now=1800000000000;
 beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-recovery-preflight-"));keys=crypto.generateKeyPairSync("ed25519")});
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const open=()=>openExclusiveRevocationWriter(keys.publicKey,dir,{clock:()=>now});
 const signed=n=>signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey);
 it("permits opening an unlocked empty store without claiming policy trust",()=>{
  const result=recoveryPreflight(dir);assert.equal(result.lockStatus,"unlocked");assert.equal(result.policyStatus,"absent");assert.equal(result.mayResumeWriting,true);assert.equal(result.mayAutomaticallyRecover,false);
 });
 it("does not authorize recovery of an active lock",()=>{
  const writer=open();
  try{const result=recoveryPreflight(dir,{isProcessAlive:()=>true});assert.equal(result.lockStatus,"owner-process-present");assert.equal(result.mayResumeWriting,false);assert.equal(result.requiresExternalFencing,true)}
  finally{writer.release()}
 });
 it("does not authorize stale lock deletion after apparent process death",()=>{
  const writer=open();
  try{const result=recoveryPreflight(dir,{isProcessAlive:()=>false});assert.equal(result.lockStatus,"owner-process-absent");assert.equal(result.mayAutomaticallyRecover,false);assert.equal(result.mayResumeWriting,false);assert.equal(fs.existsSync(result.lockPath),true)}
  finally{writer.release()}
 });
 it("reports corrupt persisted policy and blocks normal resume",()=>{
  fs.writeFileSync(path.join(dir,"revocation-policy.json"),"{bad");
  const result=recoveryPreflight(dir);assert.equal(result.policyStatus,"malformed");assert.equal(result.mayResumeWriting,false);assert.throws(()=>open(),/Corrupted persisted policy/);
 });
 it("preserves verified policy sequence after an orderly release and reopen",()=>{
  const writer=open();writer.apply(signed(1));writer.release();
  const result=recoveryPreflight(dir);assert.equal(result.policyStatus,"unverified");assert.equal(result.mayResumeWriting,true);
  const reopened=open();try{assert.equal(reopened.sequence,1);reopened.apply(signed(2));assert.equal(reopened.sequence,2)}finally{reopened.release()}
 });
});
