"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {execFileSync}=require("node:child_process");
const {RelayKeyring}=require("../scripts/echo-logic/relay-keyring");
const {fingerprint}=require("../scripts/echo-logic/certificate-policy");
const {signPolicy}=require("../scripts/echo-logic/signed-revocation-policy");
const {openPersistentRevocationStore}=require("../scripts/echo-logic/persistent-signed-revocation");
const {startMtlsRelay,sendMtls}=require("../scripts/echo-logic/mtls-relay");
describe("Echo Logic persisted signed policy live mTLS integration",function(){
 this.timeout(30000);
 let dir,relay,keys,r,store,seq;
 const openssl=(...args)=>execFileSync("openssl",args,{cwd:dir,stdio:"ignore"});
 const pem=n=>fs.readFileSync(path.join(dir,n));
 function issue(n,cn,usage){
  openssl("req","-newkey","rsa:2048","-nodes","-keyout",n+".key","-out",n+".csr","-subj","/CN="+cn);
  fs.writeFileSync(path.join(dir,n+".ext"),"extendedKeyUsage="+usage+"\n"+(usage==="serverAuth"?"subjectAltName=DNS:"+cn+"\n":""));
  openssl("x509","-req","-in",n+".csr","-CA","ca.crt","-CAkey","ca.key","-CAcreateserial","-out",n+".crt","-days","1","-extfile",n+".ext");
 }
 function update(items){
  const now=Date.now();
  store.apply(signPolicy({version:1,sequence:++seq,issuedAt:now-1000,expiresAt:now+60000,revokedFingerprints:items},keys.privateKey));
 }
 function send(client="client",provider){
  return sendMtls({port:relay.port,keyring:r,share:{index:1,data:"AQ=="},manifestHash:"a".repeat(64),clientKey:pem(client+".key"),clientCert:pem(client+".crt"),serverCa:pem("ca.crt"),getRevokedServerFingerprints:provider});
 }
 beforeEach(async()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-signed-live-"));
  openssl("req","-x509","-newkey","rsa:2048","-nodes","-keyout","ca.key","-out","ca.crt","-days","1","-subj","/CN=Echo Signed Policy CA");
  issue("server","localhost","serverAuth");issue("client","client","clientAuth");issue("replacement","replacement","clientAuth");
  keys=crypto.generateKeyPairSync("ed25519");
  r=new RelayKeyring("alpha");r.add("v1",crypto.randomBytes(32));
  store=openPersistentRevocationStore(keys.publicKey,path.join(dir,"policy"));
  seq=0;update([]);
 });
 afterEach(async()=>{
  if(relay)await new Promise(resolve=>relay.server.close(resolve));
  fs.rmSync(dir,{recursive:true,force:true});
 });
 async function start(){
  relay=await startMtlsRelay({keyring:r,tlsKey:pem("server.key"),tlsCert:pem("server.crt"),clientCa:pem("ca.crt"),getRevokedClientFingerprints:()=>store.fingerprints()});
 }
 it("rejects a revoked client after signed policy update without relay restart",async()=>{
  await start();assert.equal((await send()).accepted,true);
  update([fingerprint(pem("client.crt"))]);
  await assert.rejects(()=>send());
  assert.equal((await send("replacement")).accepted,true);
  assert.equal(relay.messages.length,2);
 });
 it("reopens persisted policy and enforces it on the running relay",async()=>{
  await start();
  update([fingerprint(pem("client.crt"))]);
  store=openPersistentRevocationStore(keys.publicKey,path.join(dir,"policy"));
  await assert.rejects(()=>send());
  assert.equal(relay.messages.length,0);
 });
 it("blocks server transmission when signed persisted policy revokes the server",async()=>{
  await start();
  const provider=()=>store.fingerprints();
  assert.equal((await send("client",provider)).accepted,true);
  update([fingerprint(pem("server.crt"))]);
  await assert.rejects(()=>send("client",provider),/revoked/);
  assert.equal(relay.messages.length,1);
 });
 it("fails closed if the signed policy expires during live connections",async()=>{
  await start();
  const now=Date.now();
  store.apply(signPolicy({version:1,sequence:++seq,issuedAt:now-1000,expiresAt:now+20,revokedFingerprints:[]},keys.privateKey));
  await new Promise(resolve=>setTimeout(resolve,45));
  await assert.rejects(()=>send());
  assert.equal(relay.messages.length,0);
 });
});
