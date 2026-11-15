"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {RelayKeyring,loadKeyFromEnvironment}=require("../scripts/echo-logic/relay-keyring");
const {startRelay,sendEncrypted}=require("../scripts/echo-logic/encrypted-loopback-relay");
describe("Echo Logic relay key lifecycle",function(){
 this.timeout(10000);
 it("loads a 256-bit key from runtime environment without embedding a secret",function(){
  const key=crypto.randomBytes(32),env={ECHO_RELAY_KEY_ALPHA:key.toString("hex")};
  assert.deepEqual(loadKeyFromEnvironment("ECHO_RELAY_KEY_ALPHA",env),key);
  assert.throws(()=>loadKeyFromEnvironment("ECHO_RELAY_KEY_ALPHA",{}),/Expected 64/);
 });
 it("rotates to a new key and retires the old key ID",function(){
  const ring=new RelayKeyring("alpha"),old=crypto.randomBytes(32),next=crypto.randomBytes(32);
  ring.add("v1",old,{activate:true});
  ring.rotate("v2",next);
  assert.equal(ring.active().keyId,"v2");
  ring.retire("v1");
  assert.throws(()=>ring.resolve("v1"),/Unknown or retired/);
  assert.deepEqual(ring.active().key,next);
  assert.throws(()=>ring.retire("v2"),/Cannot retire active/);
 });
 it("rejects duplicate key IDs and invalid key material",function(){
  const ring=new RelayKeyring("alpha");
  ring.add("v1",crypto.randomBytes(32));
  assert.throws(()=>ring.add("v1",crypto.randomBytes(32)),/already registered/);
  assert.throws(()=>ring.rotate("v2",Buffer.alloc(8)),/32-byte/);
 });
 it("a relay restarted on a rotated key rejects the retired key and accepts the new key",async()=>{
  const ring=new RelayKeyring("alpha");
  ring.add("v1",crypto.randomBytes(32));
  const oldKey=ring.active().key;
  let relay=await startRelay({relayId:"alpha",key:oldKey});
  const share={index:1,data:"AQ=="},manifestHash="a".repeat(64);
  try{
   await sendEncrypted({port:relay.port,relayId:"alpha",key:oldKey,share,manifestHash});
  }finally{await new Promise(done=>relay.server.close(done))}
  ring.rotate("v2");
  ring.retire("v1");
  relay=await startRelay({relayId:"alpha",key:ring.active().key});
  try{
   await assert.rejects(()=>sendEncrypted({port:relay.port,relayId:"alpha",key:oldKey,share,manifestHash}));
   await sendEncrypted({port:relay.port,relayId:"alpha",key:ring.active().key,share,manifestHash});
   assert.equal(relay.messages.length,1);
  }finally{await new Promise(done=>relay.server.close(done))}
 });
});
