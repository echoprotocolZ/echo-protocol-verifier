"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openFencedRevocationWriter}=require("../scripts/echo-logic/fenced-revocation-writer");
const {openLocalEpochLedger}=require("../scripts/echo-logic/local-epoch-ledger");
describe("Echo Logic persisted epoch and fenced writer integration",function(){
 let dir,keys;const now=1800000000000;
 beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-ledger-integration-"));keys=crypto.generateKeyPairSync("ed25519")});
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const ledger=()=>openLocalEpochLedger(dir);
 const open=fence=>openFencedRevocationWriter(keys.publicKey,dir,{fence,clock:()=>now});
 const signed=n=>signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey);
 it("opens a fenced writer with an epoch persisted to disk",()=>{
  const writer=open(ledger());
  try{assert.equal(writer.epoch,1);assert.equal(writer.apply(signed(1)),1);assert.equal(ledger().current(),1)}
  finally{writer.release()}
 });
 it("restores epoch history and policy sequence after orderly restart",()=>{
  const first=open(ledger());first.apply(signed(1));first.release();
  const second=open(ledger());
  try{assert.equal(second.epoch,2);assert.equal(second.sequence,1);assert.equal(second.apply(signed(2)),2)}
  finally{second.release()}
 });
 it("revokes a live writer when a newer epoch is acquired",()=>{
  const writer=open(ledger());writer.apply(signed(1));
  assert.equal(ledger().acquire(),2);
  assert.throws(()=>writer.apply(signed(2)),/epoch revoked/);
  assert.throws(()=>writer.fingerprints(),/epoch revoked/);
  writer.release();
 });
 it("fails closed when the epoch ledger is corrupted after acquisition",()=>{
  const writer=open(ledger());
  fs.writeFileSync(path.join(dir,"fencing-epoch.json"),"{broken");
  assert.throws(()=>writer.apply(signed(1)),/epoch revoked/);
  assert.throws(()=>writer.sequence,/epoch revoked/);
  writer.release();
 });
 it("rejects fenced writer initialization while epoch acquisition lock exists",()=>{
  fs.mkdirSync(path.join(dir,".fencing-epoch.lock"));
  assert.throws(()=>open(ledger()),/busy or stale lock/);
  assert.equal(fs.existsSync(path.join(dir,".revocation-writer.lock")),false);
  assert.equal(fs.existsSync(path.join(dir,".fencing-epoch.lock")),true);
 });
});
