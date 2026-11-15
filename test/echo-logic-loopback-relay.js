"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {listenRelay,sendShare,mac,verify}=require("../scripts/echo-logic/loopback-relay");
const {createFragments,reconstruct}=require("../scripts/echo-logic/threshold-fragments");
describe("Echo Logic loopback TCP transport",function(){
 this.timeout(15000);
 const keys=Array.from({length:5},()=>crypto.randomBytes(32));
 const ids=["a","b","c","d","e"];
 const context={account:"11".repeat(20),destination:"22".repeat(20),checkpointCommitment:"ab".repeat(32),chainId:80002,now:1000};
 const opts={...context,threshold:3,total:5,expiresAt:2000};
 let relays=[];
 beforeEach(async()=>{relays=await Promise.all(ids.map((relayId,i)=>listenRelay({relayId,key:keys[i]})))});
 afterEach(async()=>{await Promise.all(relays.map(r=>new Promise(resolve=>r.server.close(resolve))))});
 it("delivers five shares over independent TCP sockets and reconstructs",async()=>{
  const payload=Buffer.from("Echo Protocol Z: real localhost TCP fragment delivery");
  const bundle=createFragments(payload,opts);
  const receipts=await Promise.all(relays.map((r,i)=>sendShare({port:r.port,relayId:r.relayId,key:keys[i],manifestHash:bundle.manifestHash,share:bundle.shares[i]})));
  assert.deepEqual(receipts,[true,true,true,true,true]);
  const collected=relays.map(r=>r.received[0].share);
  assert.deepEqual(reconstruct(bundle.manifest,bundle.manifestHash,[collected[0],collected[2],collected[4]],context),payload);
 });
 it("rejects a sender with the wrong relay key",async()=>{
  const bundle=createFragments(Buffer.from("wrong key"),opts);
  const ok=await sendShare({port:relays[0].port,relayId:"a",key:keys[1],manifestHash:bundle.manifestHash,share:bundle.shares[0]});
  assert.equal(ok,false);assert.equal(relays[0].received.length,0);
 });
 it("rejects a packet addressed to another relay",async()=>{
  const bundle=createFragments(Buffer.from("wrong relay"),opts);
  const ok=await sendShare({port:relays[0].port,relayId:"b",key:keys[0],manifestHash:bundle.manifestHash,share:bundle.shares[0]});
  assert.equal(ok,false);assert.equal(relays[0].received.length,0);
 });
 it("rejects tampered authenticated frames",function(){
  const obj={version:1,relayId:"a",manifestHash:"a".repeat(64),share:{index:1,data:"AQ=="}};
  obj.mac=mac(keys[0],obj);
  assert.equal(verify(keys[0],obj),true);
  assert.equal(verify(keys[0],{...obj,manifestHash:"b".repeat(64)}),false);
 });
});
