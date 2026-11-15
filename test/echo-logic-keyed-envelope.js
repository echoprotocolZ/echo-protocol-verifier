"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {RelayKeyring}=require("../scripts/echo-logic/relay-keyring");
const {encode,decode}=require("../scripts/echo-logic/keyed-envelope");
describe("Echo Logic authenticated key identifier envelopes",function(){
 const setup=()=>{const ring=new RelayKeyring("relay-a");ring.add("v1",crypto.randomBytes(32));return ring};
 const args={relayId:"relay-a",messageId:"a".repeat(32),share:{index:1,data:"AQ=="},manifestHash:"b".repeat(64)};
 it("decrypts messages using their authenticated key ID",function(){
  const ring=setup(),packet=encode({keyring:ring,...args});
  assert.equal(packet.keyId,"v1");
  assert.deepEqual(decode(packet,ring),{share:args.share,manifestHash:args.manifestHash});
 });
 it("supports a rotation overlap before old key retirement",function(){
  const ring=setup(),old=encode({keyring:ring,...args});
  ring.rotate("v2");
  const newer=encode({keyring:ring,...args,messageId:"c".repeat(32)});
  assert.equal(newer.keyId,"v2");
  assert.deepEqual(decode(old,ring).share,args.share);
  assert.deepEqual(decode(newer,ring).share,args.share);
  ring.retire("v1");
  assert.throws(()=>decode(old,ring),/Unknown or retired key ID/);
  assert.deepEqual(decode(newer,ring).share,args.share);
 });
 it("rejects key ID substitution and wrong relay identity",function(){
  const ring=setup();ring.rotate("v2");
  const packet=encode({keyring:ring,...args});
  assert.throws(()=>decode({...packet,keyId:"v1"},ring));
  assert.throws(()=>decode({...packet,relayId:"relay-b"},ring),/Relay keyring mismatch/);
 });
 it("rejects tampered message IDs and ciphertext",function(){
  const ring=setup(),packet=encode({keyring:ring,...args});
  assert.throws(()=>decode({...packet,messageId:"c".repeat(32)},ring));
  assert.throws(()=>decode({...packet,tag:"0".repeat(32)},ring));
 });
});
