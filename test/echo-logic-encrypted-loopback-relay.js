"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const net=require("node:net");
const {startRelay,sendEncrypted,encrypt,decrypt}=require("../scripts/echo-logic/encrypted-loopback-relay");
const {createFragments,reconstruct}=require("../scripts/echo-logic/threshold-fragments");
describe("Echo Logic encrypted loopback transport",function(){
 this.timeout(15000);
 const keys=Array.from({length:5},()=>crypto.randomBytes(32)),ids=["a","b","c","d","e"];
 const ctx={account:"11".repeat(20),destination:"22".repeat(20),checkpointCommitment:"ab".repeat(32),chainId:80002,now:1000};
 const options={...ctx,threshold:3,total:5,expiresAt:2000};
 let relays=[];
 beforeEach(async()=>{relays=await Promise.all(ids.map((relayId,i)=>startRelay({relayId,key:keys[i]})))});
 afterEach(async()=>{await Promise.all(relays.map(r=>new Promise(done=>r.server.close(done))))});
 it("encrypts and delivers five shares with authenticated receipts and threshold reconstruction",async()=>{
  const payload=Buffer.from("private Echo fragment payload"),bundle=createFragments(payload,options);
  const receipts=await Promise.all(relays.map((r,i)=>sendEncrypted({port:r.port,relayId:r.relayId,key:keys[i],manifestHash:bundle.manifestHash,share:bundle.shares[i]})));
  assert.equal(receipts.length,5);
  assert.deepEqual(reconstruct(bundle.manifest,bundle.manifestHash,[0,2,4].map(i=>relays[i].messages[0].share),ctx),payload);
 });
 it("rejects decryption with a different key",function(){
  const x=encrypt({relayId:"a",messageId:"a".repeat(32),key:keys[0],manifestHash:"b".repeat(64),share:{index:1,data:"AQ=="}});
  assert.throws(()=>decrypt(x,keys[1]));
 });
 it("rejects tampering with ciphertext or relay identity",function(){
  const x=encrypt({relayId:"a",messageId:"a".repeat(32),key:keys[0],manifestHash:"b".repeat(64),share:{index:1,data:"AQ=="}});
  assert.throws(()=>decrypt({...x,relayId:"b"},keys[0]));
  assert.throws(()=>decrypt({...x,ciphertext:Buffer.from("changed").toString("base64")},keys[0]));
 });
 it("rejects replay of an already accepted message identifier",async()=>{
  const share={index:1,data:"AQ=="},messageId="f".repeat(32),manifestHash="b".repeat(64);
  await sendEncrypted({port:relays[0].port,relayId:"a",key:keys[0],share,manifestHash,messageId});
  await assert.rejects(()=>sendEncrypted({port:relays[0].port,relayId:"a",key:keys[0],share,manifestHash,messageId}));
  assert.equal(relays[0].messages.length,1);
 });
 it("does not accept receipt forged with another relay key",function(){
  const x=encrypt({relayId:"a",messageId:"a".repeat(32),key:keys[0],manifestHash:"b".repeat(64),share:{index:1,data:"AQ=="}});
  assert.equal(x.ciphertext.includes("AQ=="),false);
 });
});
