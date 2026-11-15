"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {fork}=require("node:child_process");
const path=require("node:path");
const {RelayKeyring}=require("../scripts/echo-logic/relay-keyring");
const {sendKeyed}=require("../scripts/echo-logic/keyed-tcp-relay");
const {createFragments,reconstruct}=require("../scripts/echo-logic/threshold-fragments");
describe("Echo Logic separate-process relay transport",function(){
 this.timeout(20000);
 const ids=["alpha","beta","gamma","delta","epsilon"];
 const ctx={account:"11".repeat(20),destination:"22".repeat(20),checkpointCommitment:"ab".repeat(32),chainId:80002,now:1000};
 const options={...ctx,threshold:3,total:5,expiresAt:2000};
 const workers=[];
 function awaitMessage(child,type,timeoutMs=5000){
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>finish(Error("Worker response timeout")),timeoutMs);
   const onMessage=msg=>{if(msg.type==="error")finish(Error(msg.message));else if(msg.type===type)finish(null,msg)};
   const onExit=()=>finish(Error("Worker exited"));
   function finish(error,value){clearTimeout(timer);child.off("message",onMessage);child.off("exit",onExit);error?reject(error):resolve(value)}
   child.on("message",onMessage);child.once("exit",onExit);
  });
 }
 async function launch(relayId,key){
  const child=fork(path.join(__dirname,"../scripts/echo-logic/relay-worker.js"),[],{stdio:["ignore","ignore","ignore","ipc"]});
  workers.push(child);
  const ready=awaitMessage(child,"ready");
  child.send({type:"start",relayId,keyHex:key.toString("hex")});
  return {child,...await ready};
 }
 afterEach(async()=>{
  await Promise.all(workers.splice(0).map(async child=>{
   if(child.exitCode!==null)return;
   const exited=new Promise(resolve=>child.once("exit",resolve));
   child.kill("SIGTERM");
   await exited;
  }));
 });
 it("transports shares across five distinct OS processes and reconstructs with three",async()=>{
  const keys=ids.map(()=>crypto.randomBytes(32));
  const relays=await Promise.all(ids.map((id,i)=>launch(id,keys[i])));
  assert.equal(new Set(relays.map(r=>r.pid)).size,5);
  const payload=Buffer.from("Echo Logic process-isolated relay proof of concept");
  const bundle=createFragments(payload,options);
  const rings=ids.map((id,i)=>{const ring=new RelayKeyring(id);ring.add("v1",keys[i]);return ring});
  const receipts=await Promise.all(relays.map((r,i)=>sendKeyed({port:r.port,keyring:rings[i],share:bundle.shares[i],manifestHash:bundle.manifestHash})));
  assert.equal(receipts.length,5);
  const responses=await Promise.all(relays.map(async r=>{const response=awaitMessage(r.child,"stats");r.child.send({type:"stats"});return response}));
  assert.ok(responses.every(r=>r.count===1));
  assert.deepEqual(reconstruct(bundle.manifest,bundle.manifestHash,[responses[0].shares[0],responses[2].shares[0],responses[4].shares[0]],ctx),payload);
 });
 it("rejects a sender using the wrong key across process boundaries",async()=>{
  const key=crypto.randomBytes(32),relay=await launch("alpha",key);
  const wrong=new RelayKeyring("alpha");wrong.add("v1",crypto.randomBytes(32));
  await assert.rejects(()=>sendKeyed({port:relay.port,keyring:wrong,share:{index:1,data:"AQ=="},manifestHash:"a".repeat(64)}));
  const response=awaitMessage(relay.child,"stats");relay.child.send({type:"stats"});
  assert.equal((await response).count,0);
 });
});
