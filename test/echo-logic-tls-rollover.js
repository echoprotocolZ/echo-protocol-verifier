"use strict";
/**
 * Echo Logic TLS certificate rollover regression tests.
 * This validates certificate replacement and CA trust withdrawal.
 * CA trust withdrawal is NOT certificate-specific CRL/OCSP revocation.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const crypto=require("node:crypto");
const {RelayKeyring}=require("../scripts/echo-logic/relay-keyring");
const {startMtlsRelay,sendMtls}=require("../scripts/echo-logic/mtls-relay");

describe("Echo Logic TLS certificate rollover",function(){
 this.timeout(30000);
 let dir,relay;
 const openssl=(...args)=>execFileSync("openssl",args,{cwd:dir,stdio:"ignore"});
 const pem=name=>fs.readFileSync(path.join(dir,name));
 function ca(name){
  openssl("req","-x509","-newkey","rsa:2048","-nodes","-keyout",name+".key","-out",name+".crt","-days","1","-subj","/CN="+name);
 }
 function issue(name,authority,cn,usage){
  openssl("req","-newkey","rsa:2048","-nodes","-keyout",name+".key","-out",name+".csr","-subj","/CN="+cn);
  fs.writeFileSync(path.join(dir,name+".ext"),"extendedKeyUsage="+usage+"\n"+(usage==="serverAuth"?"subjectAltName=DNS:"+cn+"\n":""));
  openssl("x509","-req","-in",name+".csr","-CA",authority+".crt","-CAkey",authority+".key","-CAcreateserial","-out",name+".crt","-days","1","-extfile",name+".ext");
 }
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-tls-rollover-"));
  ca("oldCA");ca("newCA");
  issue("oldServer","oldCA","alpha.echo.test","serverAuth");
  issue("newServer","newCA","alpha.echo.test","serverAuth");
  issue("client","newCA","client.echo.test","clientAuth");
 });
 afterEach(async()=>{
  if(relay){await new Promise(resolve=>relay.server.close(resolve));relay=null}
  fs.rmSync(dir,{recursive:true,force:true});
 });
 const payload={share:{index:1,data:"AQ=="},manifestHash:"a".repeat(64)};
 function ring(){const r=new RelayKeyring("alpha");r.add("v1",crypto.randomBytes(32));return r}
 async function start(r,certificate){
  relay=await startMtlsRelay({keyring:r,tlsKey:pem(certificate+".key"),tlsCert:pem(certificate+".crt"),clientCa:pem("newCA.crt")});
  return relay;
 }
 async function stop(){
  if(relay){await new Promise(resolve=>relay.server.close(resolve));relay=null}
 }
 function send(r,trust){return sendMtls({port:relay.port,keyring:r,servername:"alpha.echo.test",clientKey:pem("client.key"),clientCert:pem("client.crt"),serverCa:pem(trust+".crt"),...payload})}
 it("accepts a replacement certificate for the same relay identity after listener restart",async()=>{
  const r=ring();
  await start(r,"oldServer");
  assert.equal((await send(r,"oldCA")).accepted,true);
  await stop();
  await start(r,"newServer");
  assert.equal((await send(r,"newCA")).accepted,true);
  assert.equal(relay.messages.length,1);
 });
 it("rejects the retired CA trust root after certificate rollover",async()=>{
  const r=ring();
  await start(r,"newServer");
  await assert.rejects(()=>send(r,"oldCA"));
  assert.equal(relay.messages.length,0);
  assert.equal((await send(r,"newCA")).accepted,true);
 });
 it("rejects the old certificate when the peer only trusts the new authority",async()=>{
  const r=ring();
  await start(r,"oldServer");
  await assert.rejects(()=>send(r,"newCA"));
  assert.equal(relay.messages.length,0);
 });
});
