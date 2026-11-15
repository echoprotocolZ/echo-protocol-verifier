"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {startRelay,sendEncrypted}=require("../scripts/echo-logic/encrypted-loopback-relay");
describe("Echo Logic persistent replay guard",function(){
 this.timeout(12000);
 const key=crypto.randomBytes(32),share={index:1,data:"AQ=="},manifestHash="a".repeat(64),messageId="f".repeat(32);
 let dir,relay;
 beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-replay-"))});
 afterEach(async()=>{if(relay)await new Promise(resolve=>relay.server.close(resolve));relay=null;fs.rmSync(dir,{recursive:true,force:true})});
 it("rejects a replay even after a relay process is restarted",async()=>{
  relay=await startRelay({relayId:"alpha",key,replayDirectory:dir});
  await sendEncrypted({port:relay.port,relayId:"alpha",key,share,manifestHash,messageId});
  await new Promise(resolve=>relay.server.close(resolve));relay=null;
  relay=await startRelay({relayId:"alpha",key,replayDirectory:dir});
  await assert.rejects(()=>sendEncrypted({port:relay.port,relayId:"alpha",key,share,manifestHash,messageId}));
  assert.equal(relay.messages.length,0);
 });
 it("accepts a fresh message ID with the same payload",async()=>{
  relay=await startRelay({relayId:"alpha",key,replayDirectory:dir});
  await sendEncrypted({port:relay.port,relayId:"alpha",key,share,manifestHash,messageId});
  await sendEncrypted({port:relay.port,relayId:"alpha",key,share,manifestHash,messageId:"e".repeat(32)});
  assert.equal(relay.messages.length,2);
 });
});
