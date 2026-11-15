"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const crypto=require("node:crypto");
const {RelayKeyring}=require("../scripts/echo-logic/relay-keyring");
const {startMtlsRelay,sendMtls}=require("../scripts/echo-logic/mtls-relay");
describe("Echo Logic mutual TLS transport",function(){
 this.timeout(20000);
 let dir,relay;
 function openssl(...args){execFileSync("openssl",args,{cwd:dir,stdio:"ignore"})}
 function pem(name){return fs.readFileSync(path.join(dir,name),"utf8")}
 function sign(name,cn,eku){
  openssl("req","-newkey","rsa:2048","-nodes","-keyout",name+".key","-out",name+".csr","-subj","/CN="+cn);
  fs.writeFileSync(path.join(dir,name+".ext"),"extendedKeyUsage="+eku+"\n"+(eku==="serverAuth"?"subjectAltName=DNS:localhost\n":""));
  openssl("x509","-req","-in",name+".csr","-CA","ca.crt","-CAkey","ca.key","-CAcreateserial","-out",name+".crt","-days","1","-extfile",name+".ext");
 }
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-mtls-"));
  openssl("req","-x509","-newkey","rsa:2048","-nodes","-keyout","ca.key","-out","ca.crt","-days","1","-subj","/CN=Echo Test CA");
  sign("server","localhost","serverAuth");sign("client","echo-client","clientAuth");
 });
 afterEach(async()=>{if(relay){await new Promise(resolve=>relay.server.close(resolve));relay=null}fs.rmSync(dir,{recursive:true,force:true})});
 function ring(){const r=new RelayKeyring("alpha");r.add("v1",crypto.randomBytes(32));return r}
 async function start(r){relay=await startMtlsRelay({keyring:r,tlsKey:pem("server.key"),tlsCert:pem("server.crt"),clientCa:pem("ca.crt")});return relay}
 const share={index:1,data:"AQ=="},manifestHash="a".repeat(64);
 it("accepts valid client and server certificates with keyed encrypted delivery",async()=>{
  const r=ring(),s=await start(r);
  const receipt=await sendMtls({port:s.port,keyring:r,share,manifestHash,clientKey:pem("client.key"),clientCert:pem("client.crt"),serverCa:pem("ca.crt")});
  assert.equal(receipt.accepted,true);assert.equal(s.messages.length,1);
 });
 it("rejects clients without a trusted client certificate",async()=>{
  const r=ring(),s=await start(r);
  await assert.rejects(()=>sendMtls({port:s.port,keyring:r,share,manifestHash,clientKey:pem("client.key"),clientCert:pem("server.crt"),serverCa:pem("ca.crt")}));
  assert.equal(s.messages.length,0);
 });
 it("rejects incorrect server trust roots",async()=>{
  const r=ring(),s=await start(r);
  openssl("req","-x509","-newkey","rsa:2048","-nodes","-keyout","other.key","-out","other.crt","-days","1","-subj","/CN=Untrusted CA");
  await assert.rejects(()=>sendMtls({port:s.port,keyring:r,share,manifestHash,clientKey:pem("client.key"),clientCert:pem("client.crt"),serverCa:pem("other.crt")}));
 });
 it("rejects server identity mismatch",async()=>{
  const r=ring(),s=await start(r);
  await assert.rejects(()=>sendMtls({port:s.port,keyring:r,share,manifestHash,clientKey:pem("client.key"),clientCert:pem("client.crt"),serverCa:pem("ca.crt"),servername:"not-localhost"}));
 });
 it("rejects unsafe non-loopback binding",async()=>{
  await assert.rejects(()=>startMtlsRelay({keyring:ring(),tlsKey:pem("server.key"),tlsCert:pem("server.crt"),clientCa:pem("ca.crt"),host:"0.0.0.0"}),/Non-loopback/);
 });
});
