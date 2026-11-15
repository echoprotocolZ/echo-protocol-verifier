"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {assessRevocationWriterLock}=require("../scripts/echo-logic/revocation-lock-recovery-assessment");
const {openExclusiveRevocationWriter}=require("../scripts/echo-logic/exclusive-revocation-writer");
describe("Echo Logic fail-closed lock recovery assessment",function(){
 let dir,keys;
 beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-lock-assess-"));keys=crypto.generateKeyPairSync("ed25519")});
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const lock=()=>path.join(dir,".revocation-writer.lock");
 it("reports no lock without authorizing removal",()=>{
  assert.deepEqual(assessRevocationWriterLock(dir),{status:"unlocked",safeToRemove:false});
 });
 it("recognizes a live writer but never permits lock removal",()=>{
  const writer=openExclusiveRevocationWriter(keys.publicKey,dir);
  try{const result=assessRevocationWriterLock(dir,{isProcessAlive:()=>true});assert.equal(result.status,"owner-process-present");assert.equal(result.safeToRemove,false)}
  finally{writer.release()}
 });
 it("reports a missing process but still requires external fencing",()=>{
  const writer=openExclusiveRevocationWriter(keys.publicKey,dir);
  try{const result=assessRevocationWriterLock(dir,{isProcessAlive:()=>false});assert.equal(result.status,"owner-process-absent");assert.equal(result.safeToRemove,false);assert.match(result.reason,/fencing/);assert.equal(fs.existsSync(lock()),true)}
  finally{writer.release()}
 });
 it("rejects malformed ownership metadata without changing the lock",()=>{
  fs.mkdirSync(lock());fs.writeFileSync(path.join(lock(),"owner.json"),"{broken");
  const result=assessRevocationWriterLock(dir);assert.equal(result.status,"unknown");assert.equal(result.safeToRemove,false);assert.equal(fs.existsSync(lock()),true);
 });
 it("fails closed on indeterminate process status",()=>{
  const writer=openExclusiveRevocationWriter(keys.publicKey,dir);
  try{const result=assessRevocationWriterLock(dir,{isProcessAlive:()=>{throw Error("permission denied")}});assert.equal(result.status,"unknown");assert.equal(result.safeToRemove,false)}
  finally{writer.release()}
 });
});
