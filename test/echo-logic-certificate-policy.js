"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const {fingerprint,checkCertificatePolicy,loadRevocationFile}=require("../scripts/echo-logic/certificate-policy");
describe("Echo Logic certificate validity and revocation policy",function(){
 this.timeout(20000);
 let dir;
 const run=(...args)=>execFileSync("openssl",args,{cwd:dir,stdio:"ignore"});
 const read=n=>fs.readFileSync(path.join(dir,n));
 beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"echo-cert-policy-"));
  run("req","-x509","-newkey","rsa:2048","-nodes","-keyout","leaf.key","-out","leaf.crt","-days","1","-subj","/CN=alpha.echo.test");
  run("req","-x509","-newkey","rsa:2048","-nodes","-keyout","other.key","-out","other.crt","-days","1","-subj","/CN=beta.echo.test");
 });
 afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
 it("accepts a currently valid certificate not on the denylist",()=>{
  assert.equal(checkCertificatePolicy(read("leaf.crt")),true);
 });
 it("rejects expired and not-yet-valid certificates using policy time",()=>{
  const cert=new (require("node:crypto").X509Certificate)(read("leaf.crt"));
  assert.throws(()=>checkCertificatePolicy(cert,{now:new Date(Date.parse(cert.validTo)+1000)}),/expired or not yet valid/);
  assert.throws(()=>checkCertificatePolicy(cert,{now:new Date(Date.parse(cert.validFrom)-1000)}),/expired or not yet valid/);
 });
 it("rejects a fingerprint specifically revoked without rejecting another certificate",()=>{
  const revoked=fingerprint(read("leaf.crt"));
  assert.throws(()=>checkCertificatePolicy(read("leaf.crt"),{revokedFingerprints:[revoked]}),/revoked/);
  assert.equal(checkCertificatePolicy(read("other.crt"),{revokedFingerprints:[revoked]}),true);
 });
 it("loads a denylist from a JSON file and rejects malformed entries",()=>{
  const file=path.join(dir,"revoked.json");
  fs.writeFileSync(file,JSON.stringify({revokedFingerprints:[fingerprint(read("leaf.crt"))]}));
  const list=loadRevocationFile(file);
  assert.throws(()=>checkCertificatePolicy(read("leaf.crt"),{revokedFingerprints:list}),/revoked/);
  assert.throws(()=>checkCertificatePolicy(read("other.crt"),{revokedFingerprints:["not-a-fingerprint"]}),/Invalid revoked fingerprint/);
 });
});
