"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {fork,execFileSync}=require("node:child_process");
const {RelayKeyring}=require("../scripts/echo-logic/relay-keyring");
const {sendMtls}=require("../scripts/echo-logic/mtls-relay");
const {createFragments,reconstruct}=require("../scripts/echo-logic/threshold-fragments");
describe("Echo Logic multi-process mutual TLS routing",function(){
 this.timeout(30000);
 const ids=["a","b","c","d","e"];
 const ctx={account:"11".repeat(20),destination:"22".repeat(20),checkpointCommitment:"ab".repeat(32),chainId:80002,now:1000};
 let dir,children=[];
 function openssl(...args){execFileSync("openssl",args,{cwd:dir,stdio:"ignore"})}
 function file(n){return path.join(dir,n)}
 function pem(n){return fs.readFileSync(file(n))}
 function issue(n,cn,eku){
  openssl("req","-newkey","rsa:2048","-nodes","-keyout",n+".key","-out",n+".csr","-subj","/CN="+cn);
  fs.writeFileSync(file(n+".ext"),"extendedKeyUsage="+eku+"\n"+(eku==="serverAuth"?"subjectAltName=DNS:localhost\n":""));
  openssl("x509","-req","-in",n+".csr","-CA","ca.crt","-CAkey","ca.key","-CAcreateserial","-out",n+".crt","-days","1","-extfile",n+".ext");
 }
 function wait(child,type){
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>finish(Error("Worker timeout")),7000);
   const onMessage=m=>{if(m.type==="error")finish(Error(m.message));else if(m.type===type)finish(null,m)};
   const onExit=()=>finish(Error("Worker exited unexpectedly"));
   function finish(err,result){clearTimeout(timer);child.off("message",onMessage);child.off("exit",onExit);err?reject(err):resolve(result)}
   child.on("message",onMessage);child.once("exit",onExit);
  });
 }
 async function start(id,key){
  const child=fork(path.join(__dirname,"../scripts/echo-logic/mtls-relay-worker.js"),[],{stdio:["ignore","ignore","ignore","ipc"]});
  children.push(child);
  const ready=wait(child,"ready");
  child.send({type:"start",relayId:id,keyHex:key.toString("hex"),tlsKeyPath:file("server.key"),tlsCertPath:file("server.crt"),clientCaPath:file("ca.crt")});
  return {child,...await ready};
 }
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-multiprocess-mtls-"));
  openssl("req","-x509","-newkey","rsa:2048","-nodes","-keyout","ca.key","-out","ca.crt","-days","1","-subj","/CN=Echo Test CA");
  issue("server","localhost","serverAuth");issue("client","echo-client","clientAuth");
 });
 afterEach(async()=>{
  await Promise.all(children.splice(0).map(async child=>{
   if(child.exitCode!==null||child.signalCode!==null)return;
   const done=new Promise(resolve=>child.once("exit",resolve));
   child.kill("SIGTERM");await done;
  }));
  fs.rmSync(dir,{recursive:true,force:true});
 });
 it("reconstructs a payload from three of five mutually authenticated separate processes",async()=>{
  const keys=ids.map(()=>crypto.randomBytes(32));
  const relays=await Promise.all(ids.map((id,i)=>start(id,keys[i])));
  assert.equal(new Set(relays.map(r=>r.pid)).size,5);
  const bundle=createFragments(Buffer.from("Echo mutually authenticated isolated relay processes"),{...ctx,threshold:3,total:5,expiresAt:2000});
  const rings=ids.map((id,i)=>{const r=new RelayKeyring(id);r.add("v1",keys[i]);return r});
  const receipts=await Promise.all(relays.map((r,i)=>sendMtls({port:r.port,keyring:rings[i],share:bundle.shares[i],manifestHash:bundle.manifestHash,clientKey:pem("client.key"),clientCert:pem("client.crt"),serverCa:pem("ca.crt") })));
  assert.equal(receipts.length,5);
  const stats=await Promise.all(relays.map(async r=>{const response=wait(r.child,"stats");r.child.send({type:"stats"});return response}));
  assert.ok(stats.every(s=>s.count===1));
  assert.deepEqual(reconstruct(bundle.manifest,bundle.manifestHash,[stats[0].shares[0],stats[2].shares[0],stats[4].shares[0]],ctx),Buffer.from("Echo mutually authenticated isolated relay processes"));
 });
 it("rejects an untrusted client certificate across process boundaries",async()=>{
  const key=crypto.randomBytes(32),relay=await start("a",key);
  const ring=new RelayKeyring("a");ring.add("v1",key);
  await assert.rejects(()=>sendMtls({port:relay.port,keyring:ring,share:{index:1,data:"AQ=="},manifestHash:"a".repeat(64),clientKey:pem("server.key"),clientCert:pem("server.crt"),serverCa:pem("ca.crt")}));
  const stats=wait(relay.child,"stats");relay.child.send({type:"stats"});assert.equal((await stats).count,0);
 });
});
