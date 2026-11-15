"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {loadRelayConfig}=require("../scripts/echo-logic/relay-config");
const {startKeyedRelay,sendKeyed}=require("../scripts/echo-logic/keyed-tcp-relay");
describe("Echo Logic independent relay configuration",function(){
 this.timeout(10000);
 let dir,server;
 beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-relay-config-"))});
 afterEach(async()=>{if(server)await new Promise(resolve=>server.close(resolve));server=null;fs.rmSync(dir,{recursive:true,force:true})});
 function config(obj,env){
  const filename=path.join(dir,"relay.json");
  fs.writeFileSync(filename,JSON.stringify(obj));
  return loadRelayConfig(filename,env);
 }
 const base={relayId:"node_a",host:"127.0.0.1",port:0,activeKeyId:"v1",keys:[{keyId:"v1",env:"ECHO_RELAY_KEY_NODE_A"}]};
 it("loads an isolated relay from config and environment key without putting key material in JSON",async()=>{
  const key=crypto.randomBytes(32);
  const loaded=config(base,{ECHO_RELAY_KEY_NODE_A:key.toString("hex")});
  assert.equal(loaded.keyring.active().keyId,"v1");
  assert.deepEqual(loaded.keyring.active().key,key);
  const relay=await startKeyedRelay({keyring:loaded.keyring,port:loaded.port});
  server=relay.server;
  const receipt=await sendKeyed({port:relay.port,keyring:loaded.keyring,share:{index:1,data:"AQ=="},manifestHash:"a".repeat(64)});
  assert.equal(receipt.accepted,true);
  assert.equal(relay.messages.length,1);
  assert.ok(!fs.readFileSync(path.join(dir,"relay.json"),"utf8").includes(key.toString("hex")));
 });
 it("rejects binding to public interfaces before authenticated network transport exists",()=>{
  const env={ECHO_RELAY_KEY_NODE_A:crypto.randomBytes(32).toString("hex")};
  assert.throws(()=>config({...base,host:"0.0.0.0"},env),/Non-loopback/);
  assert.throws(()=>config({...base,host:"192.168.1.10"},env),/Non-loopback/);
 });
 it("rejects missing, malformed and duplicate key provisioning",()=>{
  assert.throws(()=>config(base,{}),/Expected 64 hexadecimal/);
  assert.throws(()=>config(base,{ECHO_RELAY_KEY_NODE_A:"1234"}),/Expected 64 hexadecimal/);
  assert.throws(()=>config({...base,keys:[base.keys[0],base.keys[0]]},{ECHO_RELAY_KEY_NODE_A:crypto.randomBytes(32).toString("hex")}),/Duplicate/);
 });
 it("loads an overlap key and selects the configured active key",()=>{
  const next={...base,activeKeyId:"v2",keys:[...base.keys,{keyId:"v2",env:"ECHO_RELAY_KEY_NODE_B"}]};
  const loaded=config(next,{ECHO_RELAY_KEY_NODE_A:crypto.randomBytes(32).toString("hex"),ECHO_RELAY_KEY_NODE_B:crypto.randomBytes(32).toString("hex")});
  assert.equal(loaded.keyring.active().keyId,"v2");
  assert.equal(loaded.keyring.resolve("v1").length,32);
 });
});
