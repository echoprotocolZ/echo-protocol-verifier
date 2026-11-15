"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {startRelay,sendEncrypted,verifyReceipt}=require("../scripts/echo-logic/encrypted-loopback-relay");
describe("Echo Logic authenticated receipt forgery regressions",function(){
 this.timeout(10000);
 const key=crypto.randomBytes(32),otherKey=crypto.randomBytes(32);
 const relayId="relay-a",share={index:1,data:"AQ=="},manifestHash="a".repeat(64),messageId="b".repeat(32);
 let relay,receipt;
 beforeEach(async()=>{
  relay=await startRelay({relayId,key});
  receipt=await sendEncrypted({port:relay.port,relayId,key,share,manifestHash,messageId});
 });
 afterEach(async()=>{await new Promise(resolve=>relay.server.close(resolve))});
 const context=()=>({relayId,messageId,share,manifestHash,key});
 it("accepts a genuine receipt bound to the exact message",function(){
  assert.equal(verifyReceipt(receipt,context()),true);
 });
 it("rejects a forged MAC from a different relay key",function(){
  assert.throws(()=>verifyReceipt(receipt,{...context(),key:otherKey}),/Invalid authenticated receipt/);
 });
 it("rejects tampered acceptance, digest and message identifier",function(){
  for(const modified of [{...receipt,accepted:false},{...receipt,payloadDigest:"f".repeat(64)},{...receipt,messageId:"c".repeat(32)}]){
   assert.throws(()=>verifyReceipt(modified,context()),/Invalid authenticated receipt/);
  }
 });
 it("rejects receipt substitution across relay identities and payloads",function(){
  assert.throws(()=>verifyReceipt(receipt,{...context(),relayId:"relay-b"}),/Invalid authenticated receipt/);
  assert.throws(()=>verifyReceipt(receipt,{...context(),share:{index:1,data:"Ag=="}}),/Invalid authenticated receipt/);
 });
 it("rejects missing or malformed receipt MAC",function(){
  assert.throws(()=>verifyReceipt({...receipt,mac:"bad"},context()),/Invalid authenticated receipt/);
  assert.throws(()=>verifyReceipt(null,context()),/Invalid authenticated receipt/);
 });
});
