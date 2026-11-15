"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {SignedRevocationStore,signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
describe("Echo Logic signed revocation policy distribution",function(){
 const now=1_800_000_000_000;
 let trusted,attacker,store;
 const fp=x=>x.repeat(64);
 const snapshot=(sequence,revokedFingerprints=[])=>({version:1,sequence,issuedAt:now-1000,expiresAt:now+10000,revokedFingerprints});
 beforeEach(()=>{
  trusted=crypto.generateKeyPairSync("ed25519");
  attacker=crypto.generateKeyPairSync("ed25519");
  store=new SignedRevocationStore(trusted.publicKey,{clock:()=>now});
 });
 it("accepts a signed update and distributes its fingerprint list to consumers",()=>{
  assert.equal(store.apply(signPolicy(snapshot(1,[fp("a")]),trusted.privateKey)),1);
  assert.deepEqual(store.fingerprints(),[fp("a")]);
 });
 it("rejects tampered and unauthorized updates while preserving last valid policy",()=>{
  store.apply(signPolicy(snapshot(1,[fp("a")]),trusted.privateKey));
  const changed={...signPolicy(snapshot(2,[fp("b")]),trusted.privateKey),revokedFingerprints:[fp("c")]};
  assert.throws(()=>store.apply(changed),/signature/);
  assert.throws(()=>store.apply(signPolicy(snapshot(2,[fp("b")]),attacker.privateKey)),/signature/);
  assert.deepEqual(store.fingerprints(),[fp("a")]);
 });
 it("rejects replay and rollback of signed updates",()=>{
  store.apply(signPolicy(snapshot(3),trusted.privateKey));
  assert.throws(()=>store.apply(signPolicy(snapshot(2),trusted.privateKey)),/Stale/);
  assert.throws(()=>store.apply(signPolicy(snapshot(3),trusted.privateKey)),/Stale/);
 });
 it("fails closed on stale policy and accepts a refreshed signed policy",()=>{
  let clock=now;
  const active=new SignedRevocationStore(trusted.publicKey,{clock:()=>clock});
  active.apply(signPolicy(snapshot(1,[fp("a")]),trusted.privateKey));
  clock=now+10001;
  assert.throws(()=>active.fingerprints(),/expired/);
  const refreshed={version:1,sequence:2,issuedAt:clock-100,expiresAt:clock+10000,revokedFingerprints:[fp("b")]};
  active.apply(signPolicy(refreshed,trusted.privateKey));
  assert.deepEqual(active.fingerprints(),[fp("b")]);
 });
 it("rejects malformed policy entries and expired updates",()=>{
  assert.throws(()=>store.apply(signPolicy(snapshot(1,["bad"]),trusted.privateKey)),/fingerprint/);
  const expired={...snapshot(1),expiresAt:now-1};
  assert.throws(()=>store.apply(signPolicy(expired,trusted.privateKey)),/expired|validity/);
  assert.throws(()=>store.fingerprints(),/No trusted/);
 });
});
