"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openPersistentRevocationStore}=require("../scripts/echo-logic/persistent-signed-revocation");
const {openLocalEpochLedger}=require("../scripts/echo-logic/local-epoch-ledger");
const {assertRollbackAnchors}=require("../scripts/echo-logic/rollback-anchor-preflight");
describe("Echo Logic independent rollback anchor preflight",function(){
 let dir,keys,now,policyFloor,epochFloor;
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-anchor-"));
  keys=crypto.generateKeyPairSync("ed25519");now=1800000000000;policyFloor=0;epochFloor=0;
 });
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const signed=n=>signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey);
 const check=()=>assertRollbackAnchors({directory:dir,publicKey:keys.publicKey,clock:()=>now,policyFloor:()=>policyFloor,epochFloor:()=>epochFloor});
 it("accepts empty storage only with zero trusted floors",()=>assert.deepEqual(check(),{sequence:0,epoch:0}));
 it("rejects a restored older valid signed policy below independent high-water mark",()=>{
  const store=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now});
  store.apply(signed(1));const previous=fs.readFileSync(path.join(dir,"revocation-policy.json"));
  store.apply(signed(2));policyFloor=2;
  fs.writeFileSync(path.join(dir,"revocation-policy.json"),previous);
  assert.throws(check,/Signed policy rollback detected/);
 });
 it("rejects a restored old fencing epoch below independent high-water mark",()=>{
  const ledger=openLocalEpochLedger(dir);
  ledger.acquire();const previous=fs.readFileSync(path.join(dir,"fencing-epoch.json"));
  ledger.acquire();epochFloor=2;
  fs.writeFileSync(path.join(dir,"fencing-epoch.json"),previous);
  assert.throws(check,/Fencing epoch rollback detected/);
 });
 it("rejects missing records when trusted anchors require prior state",()=>{
  policyFloor=1;assert.throws(check,/Signed policy rollback detected/);
  policyFloor=0;epochFloor=1;assert.throws(check,/Fencing epoch rollback detected/);
 });
 it("rejects absent or malformed trusted anchor providers",()=>{
  assert.throws(()=>assertRollbackAnchors({directory:dir,publicKey:keys.publicKey}),/Independent trusted/);
  policyFloor=-1;assert.throws(check,/Invalid trusted policy floor/);
 });
});
