"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {openLocalEpochLedger}=require("../scripts/echo-logic/local-epoch-ledger");
describe("Echo Logic durable local fencing epoch ledger",function(){
 let dir;
 beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-epoch-ledger-"))});
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 it("starts empty and issues a first durable epoch",()=>{
  const ledger=openLocalEpochLedger(dir);assert.equal(ledger.current(),0);assert.equal(ledger.acquire(),1);assert.equal(ledger.assertCurrent(1),true);
 });
 it("persists monotonically increasing epochs across reopen",()=>{
  assert.equal(openLocalEpochLedger(dir).acquire(),1);
  const reopened=openLocalEpochLedger(dir);assert.equal(reopened.current(),1);assert.equal(reopened.acquire(),2);assert.equal(reopened.assertCurrent(1),false);
 });
 it("rejects acquisition when a lock is present without removing it",()=>{
  fs.mkdirSync(path.join(dir,".fencing-epoch.lock"));
  const ledger=openLocalEpochLedger(dir);assert.throws(()=>ledger.acquire(),/busy or stale lock/);
  assert.equal(fs.existsSync(path.join(dir,".fencing-epoch.lock")),true);
 });
 it("fails closed when the durable epoch record is corrupted",()=>{
  fs.writeFileSync(path.join(dir,"fencing-epoch.json"),"{bad");
  const ledger=openLocalEpochLedger(dir);
  assert.equal(ledger.assertCurrent(1),false);assert.throws(()=>ledger.acquire(),/unreadable or corrupted/);
 });
 it("does not accept an outdated epoch after a subsequent acquisition",()=>{
  const first=openLocalEpochLedger(dir),a=first.acquire(),second=openLocalEpochLedger(dir),b=second.acquire();
  assert.equal(b,a+1);assert.equal(first.assertCurrent(a),false);assert.equal(second.assertCurrent(b),true);
 });
});
