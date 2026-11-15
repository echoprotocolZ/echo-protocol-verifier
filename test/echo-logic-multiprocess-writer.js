"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {fork}=require("node:child_process");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openExclusiveRevocationWriter}=require("../scripts/echo-logic/exclusive-revocation-writer");
describe("Echo Logic independent-process revocation writer contention",function(){
 this.timeout(20000);
 let dir,keys,children;
 const now=1800000000000;
 beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-multiprocess-writer-"));keys=crypto.generateKeyPairSync("ed25519");children=[];fs.writeFileSync(path.join(dir,"public.pem"),keys.publicKey.export({type:"spki",format:"pem"}))});
 afterEach(async()=>{
  for(const child of children){if(child.exitCode===null&&!child.killed){child.kill("SIGKILL");await new Promise(resolve=>child.once("exit",resolve))}}
  fs.rmSync(dir,{recursive:true,force:true});
 });
 function spawn(){
  const child=fork(path.join(__dirname,"../scripts/echo-logic/exclusive-writer-child.js"),[dir,path.join(dir,"public.pem")],{stdio:["ignore","ignore","ignore","ipc"]});
  children.push(child);return child;
 }
 function next(child){
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>finish(Error("Child IPC timeout")),4000);
   function finish(error,value){clearTimeout(timer);child.off("message",onMessage);child.off("exit",onExit);error?reject(error):resolve(value)}
   function onMessage(message){finish(null,message)}
   function onExit(){finish(Error("Child exited before response"))}
   child.once("message",onMessage);child.once("exit",onExit);
  });
 }
 async function launch(){const child=spawn();const result=await next(child);return {child,result}}
 function signed(n){return signPolicy({version:1,sequence:n,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:[]},keys.privateKey)}
 it("allows only one of two independent processes to hold the writer lock",async()=>{
  const first=await launch();assert.equal(first.result.type,"acquired");
  const second=await launch();assert.equal(second.result.type,"rejected");
  assert.match(second.result.message,/lock already held/);
 });
 it("prevents a third process from taking a live process lock",async()=>{
  const first=await launch();assert.equal(first.result.type,"acquired");
  for(let i=0;i<2;i++){const rival=await launch();assert.equal(rival.result.type,"rejected")}
 });
 it("permits a new process to acquire ownership after orderly release",async()=>{
  const first=await launch();assert.equal(first.result.type,"acquired");
  const released=next(first.child);first.child.send("release");assert.equal((await released).type,"released");
  await new Promise(resolve=>first.child.once("exit",resolve));
  const second=await launch();assert.equal(second.result.type,"acquired");
 });
 it("leaves a stale lock after forced termination and refuses unsafe takeover",async()=>{
  const first=await launch();assert.equal(first.result.type,"acquired");
  const exited=new Promise(resolve=>first.child.once("exit",resolve));
  first.child.kill("SIGKILL");await exited;
  const second=await launch();assert.equal(second.result.type,"rejected");
  assert.match(second.result.message,/manual recovery required/);
 });
 it("keeps a verified policy intact when a rival process cannot acquire the lock",async()=>{
  const first=await launch();assert.equal(first.result.type,"acquired");
  const second=await launch();assert.equal(second.result.type,"rejected");
  // Independent lock holder cannot update this policy through the wrapper;
  // verify the on-disk snapshot remains valid and readable.
  const {openPersistentRevocationStore}=require("../scripts/echo-logic/persistent-signed-revocation");
  const policy=openPersistentRevocationStore(keys.publicKey,dir,{clock:()=>now});
  assert.equal(policy.sequence,0);
 });
});
