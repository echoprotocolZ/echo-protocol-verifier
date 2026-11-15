"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {execFileSync}=require("node:child_process");
const {RelayKeyring}=require("../scripts/echo-logic/relay-keyring");
const {fingerprint}=require("../scripts/echo-logic/certificate-policy");
const {startMtlsRelay,sendMtls}=require("../scripts/echo-logic/mtls-relay");
describe("Echo Logic live TLS certificate revocation enforcement",function(){
 this.timeout(20000);
 let dir,relay;
 const openssl=(...args)=>execFileSync("openssl",args,{cwd:dir,stdio:"ignore"});
 const pem=n=>fs.readFileSync(path.join(dir,n));
 function issue(n,cn,usage){
  openssl("req","-newkey","rsa:2048","-nodes","-keyout",n+".key","-out",n+".csr","-subj","/CN="+cn);
  fs.writeFileSync(path.join(dir,n+".ext"),"extendedKeyUsage="+usage+"\n"+(usage==="serverAuth"?"subjectAltName=DNS:"+cn+"\n":""));
  openssl("x509","-req","-in",n+".csr","-CA","ca.crt","-CAkey","ca.key","-CAcreateserial","-out",n+".crt","-days","1","-extfile",n+".ext");
 }
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-live-revoke-"));
  openssl("req","-x509","-newkey","rsa:2048","-nodes","-keyout","ca.key","-out","ca.crt","-days","1","-subj","/CN=Echo Live Revocation Test CA");
  issue("server","localhost","serverAuth");
  issue("client","echo-client","clientAuth");
  issue("otherClient","echo-other","clientAuth");
 });
 afterEach(async()=>{
  if(relay){await new Promise(resolve=>relay.server.close(resolve));relay=null}
  fs.rmSync(dir,{recursive:true,force:true});
 });
 function ring(){const r=new RelayKeyring("alpha");r.add("v1",crypto.randomBytes(32));return r}
 async function start(r,revokedClientFingerprints=[]){
  relay=await startMtlsRelay({keyring:r,tlsKey:pem("server.key"),tlsCert:pem("server.crt"),clientCa:pem("ca.crt"),revokedClientFingerprints});
 }
 const share={index:1,data:"AQ=="},manifestHash="a".repeat(64);
 function send(r,client="client",revokedServerFingerprints=[]){
  return sendMtls({port:relay.port,keyring:r,share,manifestHash,clientKey:pem(client+".key"),clientCert:pem(client+".crt"),serverCa:pem("ca.crt"),revokedServerFingerprints});
 }
 it("rejects a revoked client certificate during a real TLS connection",async()=>{
  const r=ring();await start(r,[fingerprint(pem("client.crt"))]);
  await assert.rejects(()=>send(r));
  assert.equal(relay.messages.length,0);
 });
 it("allows an unrelated client certificate when another client is revoked",async()=>{
  const r=ring();await start(r,[fingerprint(pem("client.crt"))]);
  const receipt=await send(r,"otherClient");
  assert.equal(receipt.accepted,true);
  assert.equal(relay.messages.length,1);
 });
 it("rejects a revoked server certificate before transmitting an envelope",async()=>{
  const r=ring();await start(r);
  await assert.rejects(()=>send(r,"client",[fingerprint(pem("server.crt"))]),/revoked/);
  assert.equal(relay.messages.length,0);
 });
 it("continues to accept a non-revoked server certificate",async()=>{
  const r=ring();await start(r);
  const receipt=await send(r,"client",[fingerprint(pem("otherClient.crt"))]);
  assert.equal(receipt.accepted,true);
 });
});
