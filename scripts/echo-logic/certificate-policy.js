"use strict";
/**
 * Local certificate policy for Echo Logic test infrastructure.
 * Enforces leaf certificate validity and explicit SHA-256 fingerprint denylist.
 * This is an application-level denylist, not CRL or OCSP revocation.
 */
const crypto=require("node:crypto");
const fs=require("node:fs");
function fingerprint(cert){
 const x509=cert instanceof crypto.X509Certificate?cert:new crypto.X509Certificate(cert);
 return x509.fingerprint256.replace(/:/g,"").toLowerCase();
}
function checkCertificatePolicy(cert,{now=new Date(),revokedFingerprints=[]}={}){
 const x509=cert instanceof crypto.X509Certificate?cert:new crypto.X509Certificate(cert);
 const at=now instanceof Date?now:new Date(now);
 if(!Number.isFinite(at.getTime()))throw Error("Invalid policy time");
 const start=Date.parse(x509.validFrom),end=Date.parse(x509.validTo);
 if(!Number.isFinite(start)||!Number.isFinite(end)||at.getTime()<start||at.getTime()>end)throw Error("Certificate expired or not yet valid");
 if(!Array.isArray(revokedFingerprints))throw Error("Invalid revocation list");
 const revoked=new Set(revokedFingerprints.map(x=>{
  if(typeof x!=="string"||!(/^[0-9a-f]{64}$/i.test(x.replace(/:/g,""))))throw Error("Invalid revoked fingerprint");
  return x.replace(/:/g,"").toLowerCase();
 }));
 if(revoked.has(fingerprint(x509)))throw Error("Certificate fingerprint revoked");
 return true;
}
function loadRevocationFile(filename){
 const value=JSON.parse(fs.readFileSync(filename,"utf8"));
 if(!value||!Array.isArray(value.revokedFingerprints))throw Error("Invalid revocation file");
 return value.revokedFingerprints;
}
module.exports={fingerprint,checkCertificatePolicy,loadRevocationFile};
