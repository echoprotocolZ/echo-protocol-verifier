"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {RelayKeyring}=require("../scripts/echo-logic/relay-keyring");
const {startKeyedRelay,sendKeyed,verifyKeyedReceipt}=require("../scripts/echo-logic/keyed-tcp-relay");
const {createFragments,reconstruct}=require("../scripts/echo-logic/threshold-fragments");
describe("Echo Logic keyed TCP integration",function(){
 this.timeout(12000);
 const ids=["a","b","c","d","e"];
 const ctx={account:"11".repeat(20),destination:"22".repeat(20),checkpointCommitment:"ab".repeat(32),chainId:80002,now:1000};
 const options={...ctx,threshold:3,total:5,expiresAt:2000};
 let rings=[],relays=[];
 beforeEach(async()=>{
  rings=ids.map(id=>{const ring=new RelayKeyring(id);ring.add("v1",crypto.randomBytes(32));return ring});
  relays=await Promise.all(rings.map(keyring=>startKeyedRelay({keyring})));
 });
 afterEach(async()=>{await Promise.all(relays.map(r=>new Promise(done=>r.server.close(done))))});
 it("delivers five keyed TCP fragments and reconstructs from any three",async()=>{
  const payload=Buffer.from("Echo keyed TCP integration"),bundle=createFragments(payload,options);
  const receipts=await Promise.all(rings.map((keyring,i)=>sendKeyed({port:relays[i].port,keyring,share:bundle.shares[i],manifestHash:bundle.manifestHash})));
  assert.equal(receipts.length,5);
  assert.ok(receipts.every(r=>r.keyId==="v1"));
  assert.deepEqual(reconstruct(bundle.manifest,bundle.manifestHash,[0,2,4].map(i=>relays[i].messages[0].share),ctx),payload);
 });
 it("rotates live without restarting and rejects retired key identifiers",async()=>{
  const share={index:1,data:"AQ=="},manifestHash="a".repeat(64);
  const senderOld=new RelayKeyring("a");
  senderOld.add("v1",rings[0].resolve("v1"));
  rings[0].rotate("v2");
  await sendKeyed({port:relays[0].port,keyring:senderOld,share,manifestHash});
  await sendKeyed({port:relays[0].port,keyring:rings[0],share,manifestHash});
  rings[0].retire("v1");
  await assert.rejects(()=>sendKeyed({port:relays[0].port,keyring:senderOld,share,manifestHash}));
  await sendKeyed({port:relays[0].port,keyring:rings[0],share,manifestHash});
  assert.equal(relays[0].messages.length,3);
 });
 it("rejects incorrect relay keys and receipt substitution",async()=>{
  const share={index:1,data:"AQ=="},manifestHash="a".repeat(64),messageId="c".repeat(32);
  const receipt=await sendKeyed({port:relays[0].port,keyring:rings[0],share,manifestHash,messageId});
  assert.throws(()=>verifyKeyedReceipt({...receipt,keyId:"v2"},{keyring:rings[0],relayId:"a",keyId:"v1",messageId,share,manifestHash}),/Invalid keyed receipt/);
  assert.throws(()=>verifyKeyedReceipt({...receipt,payloadDigest:"f".repeat(64)},{keyring:rings[0],relayId:"a",keyId:"v1",messageId,share,manifestHash}),/Invalid keyed receipt/);
  const rogue=new RelayKeyring("a");rogue.add("v1",crypto.randomBytes(32));
  await assert.rejects(()=>sendKeyed({port:relays[0].port,keyring:rogue,share,manifestHash}));
 });
 it("rejects replayed message identifiers",async()=>{
  const share={index:1,data:"AQ=="},manifestHash="a".repeat(64),messageId="d".repeat(32);
  await sendKeyed({port:relays[0].port,keyring:rings[0],share,manifestHash,messageId});
  await assert.rejects(()=>sendKeyed({port:relays[0].port,keyring:rings[0],share,manifestHash,messageId}));
 });
});
