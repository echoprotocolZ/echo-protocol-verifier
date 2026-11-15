"use strict";
/**
 * Echo Logic mTLS transport prototype.
 * TLS authenticates both endpoints; keyed envelopes provide per-message
 * authentication and optional durable replay defense.
 * Caller supplies independently provisioned PEM credentials.
 */
const tls=require("node:tls");
const crypto=require("node:crypto");
const {encode,decode}=require("./keyed-envelope");
const {createReplayGuard}=require("./durable-replay-guard");
const {checkCertificatePolicy}=require("./certificate-policy");
const MAX=2*1024*1024;
function revocations(staticList,provider){
 if(provider!==undefined&&typeof provider!=="function")throw Error("Revocation provider must be a function");
 const value=provider?provider():staticList;
 if(!Array.isArray(value))throw Error("Revocation provider must return an array");
 return value;
}
function frame(x){const body=Buffer.from(JSON.stringify(x));if(body.length>MAX)throw Error("Frame too large");const h=Buffer.alloc(4);h.writeUInt32BE(body.length);return Buffer.concat([h,body])}
function read(socket){return new Promise((resolve,reject)=>{
 let buffer=Buffer.alloc(0),finished=false;
 const timeout=setTimeout(()=>finish(Error("Frame timeout")),5000);
 function finish(error,result){if(finished)return;finished=true;clearTimeout(timeout);socket.off("data",onData);socket.off("error",onError);socket.off("close",onClose);error?reject(error):resolve(result)}
 function onData(chunk){buffer=Buffer.concat([buffer,chunk]);if(buffer.length<4)return;const n=buffer.readUInt32BE(0);if(n>MAX)return finish(Error("Frame too large"));if(buffer.length>=n+4){try{finish(null,JSON.parse(buffer.subarray(4,n+4).toString()))}catch(e){finish(e)}}}
 function onError(e){finish(e)}
 function onClose(){finish(Error("Socket closed before frame"))}
 socket.on("data",onData);socket.once("error",onError);socket.once("close",onClose);
})}
function checkPem(value,name){if(typeof value!=="string"&&!Buffer.isBuffer(value))throw Error(name+" PEM required")}
async function startMtlsRelay({keyring,tlsKey,tlsCert,clientCa,port=0,host="127.0.0.1",replayDirectory,revokedClientFingerprints=[],getRevokedClientFingerprints}){
 if(host!=="127.0.0.1")throw Error("Non-loopback mTLS binding requires explicit security review");
 checkPem(tlsKey,"Server key");checkPem(tlsCert,"Server certificate");checkPem(clientCa,"Client CA");
 revocations(revokedClientFingerprints,getRevokedClientFingerprints);
 const seen=new Set(),guard=replayDirectory?createReplayGuard(replayDirectory):null,messages=[];
 const server=tls.createServer({key:tlsKey,cert:tlsCert,ca:clientCa,requestCert:true,rejectUnauthorized:true,minVersion:"TLSv1.3"},socket=>{
  (async()=>{try{
   if(!socket.authorized)throw Error("Client certificate rejected");
   const peer=socket.getPeerCertificate(true);
   if(!peer||!peer.raw)throw Error("Missing client certificate");
   checkCertificatePolicy(peer.raw,{revokedFingerprints:revocations(revokedClientFingerprints,getRevokedClientFingerprints)});
   const envelope=await read(socket);
   const payload=decode(envelope,keyring);
   if(seen.has(envelope.messageId))throw Error("Replay");
   if(guard&&!guard.claim(keyring.relayId,envelope.messageId))throw Error("Persistent replay");
   seen.add(envelope.messageId);
   messages.push({messageId:envelope.messageId,keyId:envelope.keyId,...payload});
   const receipt={version:3,relayId:keyring.relayId,keyId:envelope.keyId,messageId:envelope.messageId,payloadDigest:crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"),accepted:true};
   const macBody=JSON.stringify([receipt.version,receipt.relayId,receipt.keyId,receipt.messageId,receipt.payloadDigest,receipt.accepted]);
   receipt.mac=crypto.createHmac("sha256",keyring.resolve(envelope.keyId)).update(macBody).digest("hex");
   socket.end(frame(receipt));
  }catch{socket.destroy()}})();
 });
 await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,host,resolve)});
 return {server,port:server.address().port,messages};
}
async function sendMtls({port,keyring,share,manifestHash,clientKey,clientCert,serverCa,servername="localhost",messageId=crypto.randomBytes(16).toString("hex"),revokedServerFingerprints=[],getRevokedServerFingerprints}){
 checkPem(clientKey,"Client key");checkPem(clientCert,"Client certificate");checkPem(serverCa,"Server CA");
 revocations(revokedServerFingerprints,getRevokedServerFingerprints);
 const {verifyKeyedReceipt}=require("./keyed-tcp-relay");
 const envelope=encode({keyring,relayId:keyring.relayId,messageId,share,manifestHash});
 const socket=tls.connect({host:"127.0.0.1",port,servername,key:clientKey,cert:clientCert,ca:serverCa,rejectUnauthorized:true,minVersion:"TLSv1.3"});
 try{
  await new Promise((resolve,reject)=>{socket.once("secureConnect",resolve);socket.once("error",reject)});
  if(!socket.authorized)throw Error("Server certificate rejected");
  const peer=socket.getPeerCertificate(true);
  if(!peer||!peer.raw)throw Error("Missing server certificate");
  checkCertificatePolicy(peer.raw,{revokedFingerprints:revocations(revokedServerFingerprints,getRevokedServerFingerprints)});
  const response=read(socket);socket.write(frame(envelope));
  const receipt=await response;
  verifyKeyedReceipt(receipt,{keyring,relayId:keyring.relayId,keyId:envelope.keyId,messageId,share,manifestHash});
  return receipt;
 }finally{socket.destroy()}
}
module.exports={startMtlsRelay,sendMtls};
