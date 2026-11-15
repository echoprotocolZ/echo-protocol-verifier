"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const {RelayKeyring}=require("../scripts/echo-logic/relay-keyring");
const {startMtlsRelay,sendMtls}=require("../scripts/echo-logic/mtls-relay");
describe("Echo Logic per-relay TLS identities",function(){
 this.timeout(30000);
 let dir,servers=[];
 const run=(...args)=>execFileSync("openssl",args,{cwd:dir,stdio:"ignore"});
 const read=n=>fs.readFileSync(path.join(dir,n));
 function issue(name,cn,usage){
  run("req","-newkey","rsa:2048","-nodes","-keyout",name+".key","-out",name+".csr","-subj","/CN="+cn);
  fs.writeFileSync(path.join(dir,name+".ext"),"extendedKeyUsage="+usage+"\n"+(usage==="serverAuth"?"subjectAltName=DNS:"+cn+"\n":""));
  run("x509","-req","-in",name+".csr","-CA","ca.crt","-CAkey","ca.key","-CAcreateserial","-out",name+".crt","-days","1","-extfile",name+".ext");
 }
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-relay-identity-"));
  run("req","-x509","-newkey","rsa:2048","-nodes","-keyout","ca.key","-out","ca.crt","-days","1","-subj","/CN=Echo Identity Test CA");
  issue("alpha","alpha.echo.test","serverAuth");
  issue("beta","beta.echo.test","serverAuth");
  issue("client","client.echo.test","clientAuth");
 });
 afterEach(async()=>{
  await Promise.all(servers.splice(0).map(server=>new Promise(done=>server.close(done))));
  fs.rmSync(dir,{recursive:true,force:true});
 });
 async function launch(id){
  const keyring=new RelayKeyring(id);
  keyring.add("v1",crypto.randomBytes(32));
  const relay=await startMtlsRelay({keyring,tlsKey:read(id+".key"),tlsCert:read(id+".crt"),clientCa:read("ca.crt")});
  servers.push(relay.server);
  return {...relay,keyring};
 }
 const payload={share:{index:1,data:"AQ=="},manifestHash:"a".repeat(64)};
 const credentials=()=>({clientKey:read("client.key"),clientCert:read("client.crt"),serverCa:read("ca.crt")});
 it("authenticates two distinct server identities using independent certificates",async()=>{
  const alpha=await launch("alpha"),beta=await launch("beta");
  assert.notDeepEqual(read("alpha.crt"),read("beta.crt"));
  const a=await sendMtls({port:alpha.port,keyring:alpha.keyring,servername:"alpha.echo.test",...credentials(),...payload});
  const b=await sendMtls({port:beta.port,keyring:beta.keyring,servername:"beta.echo.test",...credentials(),...payload});
  assert.equal(a.relayId,"alpha");assert.equal(b.relayId,"beta");
  assert.equal(alpha.messages.length,1);assert.equal(beta.messages.length,1);
 });
 it("rejects relay identity substitution even when certificates share a trusted CA",async()=>{
  const alpha=await launch("alpha");
  await assert.rejects(()=>sendMtls({port:alpha.port,keyring:alpha.keyring,servername:"beta.echo.test",...credentials(),...payload}));
  assert.equal(alpha.messages.length,0);
 });
 it("rejects an untrusted relay CA",async()=>{
  const beta=await launch("beta");
  run("req","-x509","-newkey","rsa:2048","-nodes","-keyout","other.key","-out","other.crt","-days","1","-subj","/CN=Other Test CA");
  await assert.rejects(()=>sendMtls({port:beta.port,keyring:beta.keyring,servername:"beta.echo.test",clientKey:read("client.key"),clientCert:read("client.crt"),serverCa:read("other.crt"),...payload}));
  assert.equal(beta.messages.length,0);
 });
});
