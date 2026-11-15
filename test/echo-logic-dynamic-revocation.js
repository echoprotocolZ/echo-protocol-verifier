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
describe("Echo Logic dynamic TLS revocation",function(){
 this.timeout(25000);
 let dir,relay;
 const run=(...args)=>execFileSync("openssl",args,{cwd:dir,stdio:"ignore"});
 const pem=n=>fs.readFileSync(path.join(dir,n));
 function issue(n,cn,usage){
  run("req","-newkey","rsa:2048","-nodes","-keyout",n+".key","-out",n+".csr","-subj","/CN="+cn);
  fs.writeFileSync(path.join(dir,n+".ext"),"extendedKeyUsage="+usage+"\n"+(usage==="serverAuth"?"subjectAltName=DNS:"+cn+"\n":""));
  run("x509","-req","-in",n+".csr","-CA","ca.crt","-CAkey","ca.key","-CAcreateserial","-out",n+".crt","-days","1","-extfile",n+".ext");
 }
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-dynamic-revoke-"));
  run("req","-x509","-newkey","rsa:2048","-nodes","-keyout","ca.key","-out","ca.crt","-days","1","-subj","/CN=Echo Dynamic Test CA");
  issue("server","localhost","serverAuth");
  issue("client","echo-client","clientAuth");
  issue("replacement","echo-replacement","clientAuth");
 });
 afterEach(async()=>{
  if(relay)await new Promise(resolve=>relay.server.close(resolve));
  fs.rmSync(dir,{recursive:true,force:true});
 });
 const payload={share:{index:1,data:"AQ=="},manifestHash:"a".repeat(64)};
 function ring(){const r=new RelayKeyring("alpha");r.add("v1",crypto.randomBytes(32));return r}
 function send(r,client="client",getRevokedServerFingerprints){
  return sendMtls({port:relay.port,keyring:r,clientKey:pem(client+".key"),clientCert:pem(client+".crt"),serverCa:pem("ca.crt"),getRevokedServerFingerprints,...payload});
 }
 it("revokes a client on the next connection without restarting its relay",async()=>{
  const revoked=new Set(),r=ring();
  relay=await startMtlsRelay({keyring:r,tlsKey:pem("server.key"),tlsCert:pem("server.crt"),clientCa:pem("ca.crt"),getRevokedClientFingerprints:()=>[...revoked]});
  assert.equal((await send(r)).accepted,true);
  revoked.add(fingerprint(pem("client.crt")));
  await assert.rejects(()=>send(r));
  assert.equal(relay.messages.length,1);
  assert.equal((await send(r,"replacement")).accepted,true);
  assert.equal(relay.messages.length,2);
 });
 it("updates sender-side server revocation before sending subsequent envelopes",async()=>{
  const revoked=new Set(),r=ring();
  relay=await startMtlsRelay({keyring:r,tlsKey:pem("server.key"),tlsCert:pem("server.crt"),clientCa:pem("ca.crt")});
  const provider=()=>[...revoked];
  assert.equal((await send(r,"client",provider)).accepted,true);
  revoked.add(fingerprint(pem("server.crt")));
  await assert.rejects(()=>send(r,"client",provider),/revoked/);
  assert.equal(relay.messages.length,1);
 });
 it("fails closed when a revocation provider returns malformed data",async()=>{
  const r=ring();
  await assert.rejects(()=>startMtlsRelay({keyring:r,tlsKey:pem("server.key"),tlsCert:pem("server.crt"),clientCa:pem("ca.crt"),getRevokedClientFingerprints:()=>null}),/must return an array/);
 });
});
