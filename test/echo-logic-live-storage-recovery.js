"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {execFileSync}=require("node:child_process");
const {RelayKeyring}=require("../scripts/echo-logic/relay-keyring");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openPersistentRevocationStore}=require("../scripts/echo-logic/persistent-signed-revocation");
const {startMtlsRelay,sendMtls}=require("../scripts/echo-logic/mtls-relay");
const {fingerprint}=require("../scripts/echo-logic/certificate-policy");
describe("Echo Logic live TLS fail-closed policy storage recovery",function(){
 this.timeout(30000);
 let dir,relay,keys,ring,store,sequence;
 const run=(...args)=>execFileSync("openssl",args,{cwd:dir,stdio:"ignore"});
 const pem=n=>fs.readFileSync(path.join(dir,n));
 function issue(n,cn,usage){
  run("req","-newkey","rsa:2048","-nodes","-keyout",n+".key","-out",n+".csr","-subj","/CN="+cn);
  fs.writeFileSync(path.join(dir,n+".ext"),"extendedKeyUsage="+usage+"\n"+(usage==="serverAuth"?"subjectAltName=DNS:"+cn+"\n":""));
  run("x509","-req","-in",n+".csr","-CA","ca.crt","-CAkey","ca.key","-CAcreateserial","-out",n+".crt","-days","1","-extfile",n+".ext");
 }
 function signed(items){
  const now=Date.now();
  return signPolicy({version:1,sequence:++sequence,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:items},keys.privateKey);
 }
 function send(client="client"){
  return sendMtls({port:relay.port,keyring:ring,share:{index:1,data:"AQ=="},manifestHash:"a".repeat(64),clientKey:pem(client+".key"),clientCert:pem(client+".crt"),serverCa:pem("ca.crt")});
 }
 beforeEach(async()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-live-crash-"));
  run("req","-x509","-newkey","rsa:2048","-nodes","-keyout","ca.key","-out","ca.crt","-days","1","-subj","/CN=Echo Live Crash Test CA");
  issue("server","localhost","serverAuth");issue("client","client","clientAuth");issue("replacement","replacement","clientAuth");
  keys=crypto.generateKeyPairSync("ed25519");
  ring=new RelayKeyring("alpha");ring.add("v1",crypto.randomBytes(32));
  sequence=0;
  store=openPersistentRevocationStore(keys.publicKey,path.join(dir,"policy"));
  store.apply(signed([]));
  relay=await startMtlsRelay({keyring:ring,tlsKey:pem("server.key"),tlsCert:pem("server.crt"),clientCa:pem("ca.crt"),getRevokedClientFingerprints:()=>store.fingerprints()});
 });
 afterEach(async()=>{
  if(relay)await new Promise(resolve=>relay.server.close(resolve));
  fs.rmSync(dir,{recursive:true,force:true});
 });
 it("rejects all new clients after a post-rename persistence failure",async()=>{
  assert.equal((await send()).accepted,true);
  const original=fs.fsyncSync;let calls=0;
  fs.fsyncSync=function(fd){if(++calls===2)throw Error("injected directory fsync failure");return original(fd)};
  try{assert.throws(()=>store.apply(signed([fingerprint(pem("client.crt"))])),/uncertain/)}
  finally{fs.fsyncSync=original}
  await assert.rejects(()=>send());
  await assert.rejects(()=>send("replacement"));
  assert.equal(relay.messages.length,1);
 });
 it("reopens and revalidates persisted policy before resuming connections",async()=>{
  const original=fs.fsyncSync;let calls=0;
  fs.fsyncSync=function(fd){if(++calls===2)throw Error("injected directory fsync failure");return original(fd)};
  try{assert.throws(()=>store.apply(signed([fingerprint(pem("client.crt"))])),/uncertain/)}
  finally{fs.fsyncSync=original}
  await assert.rejects(()=>send("replacement"));
  store=openPersistentRevocationStore(keys.publicKey,path.join(dir,"policy"));
  await assert.rejects(()=>send());
  assert.equal((await send("replacement")).accepted,true);
  assert.equal(relay.messages.length,1);
 });
 it("does not resume if recovery encounters a corrupted persisted policy",async()=>{
  const original=fs.fsyncSync;let calls=0;
  fs.fsyncSync=function(fd){if(++calls===2)throw Error("injected directory fsync failure");return original(fd)};
  try{assert.throws(()=>store.apply(signed([])),/uncertain/)}
  finally{fs.fsyncSync=original}
  fs.writeFileSync(path.join(dir,"policy","revocation-policy.json"),"corrupted");
  assert.throws(()=>openPersistentRevocationStore(keys.publicKey,path.join(dir,"policy")) ,/Corrupted/);
  await assert.rejects(()=>send());
  assert.equal(relay.messages.length,0);
 });
});
