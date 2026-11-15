"use strict";
/**
 * Echo Logic v2: loopback-only encrypted fragment transport.
 * AES-256-GCM with per-message random nonce, HMAC-authenticated receipt,
 * bounded per-relay replay cache. Prototype: shared symmetric secrets,
 * no key exchange, durable storage, or public-network security.
 */
const net=require("node:net");
const crypto=require("node:crypto");
const MAX=2*1024*1024;
const {createReplayGuard}=require("./durable-replay-guard");
const h=(key,data)=>crypto.createHmac("sha256",key).update(data).digest("hex");
const digest=data=>crypto.createHash("sha256").update(data).digest("hex");
const canonical=x=>JSON.stringify([x.version,x.relayId,x.messageId,x.iv,x.ciphertext,x.tag]);
const receiptCanonical=x=>JSON.stringify([x.version,x.relayId,x.messageId,x.payloadDigest,x.accepted]);
function pack(x){const b=Buffer.from(JSON.stringify(x));if(b.length>MAX)throw Error("Frame too large");const n=Buffer.alloc(4);n.writeUInt32BE(b.length);return Buffer.concat([n,b])}
function safeEqual(a,b){return typeof a==="string"&&typeof b==="string"&&/^[0-9a-f]{64}$/.test(a)&&/^[0-9a-f]{64}$/.test(b)&&crypto.timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"))}
function encrypt({relayId,messageId,share,manifestHash,key}){
 if(!Buffer.isBuffer(key)||key.length!==32)throw Error("32-byte key required");
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
 const plaintext=Buffer.from(JSON.stringify({share,manifestHash}));
 const aad=Buffer.from(JSON.stringify([2,relayId,messageId]));
 cipher.setAAD(aad);
 const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
 return {version:2,relayId,messageId,iv:iv.toString("hex"),ciphertext:ciphertext.toString("base64"),tag:cipher.getAuthTag().toString("hex")};
}
function decrypt(x,key){
 if(!x||x.version!==2||typeof x.relayId!=="string"||! /^[0-9a-f]{32}$/.test(x.messageId)||! /^[0-9a-f]{24}$/.test(x.iv)||! /^[0-9a-f]{32}$/.test(x.tag)||typeof x.ciphertext!=="string")throw Error("Invalid encrypted frame");
 const decipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(x.iv,"hex"));
 decipher.setAAD(Buffer.from(JSON.stringify([2,x.relayId,x.messageId])));
 decipher.setAuthTag(Buffer.from(x.tag,"hex"));
 return JSON.parse(Buffer.concat([decipher.update(Buffer.from(x.ciphertext,"base64")),decipher.final()]).toString("utf8"));
}
function readFrame(socket){
 return new Promise((resolve,reject)=>{
  let data=Buffer.alloc(0),done=false;
  const finish=(error,value)=>{if(done)return;done=true;socket.removeListener("data",onData);socket.removeListener("error",onError);socket.removeListener("close",onClose);error?reject(error):resolve(value)};
  const onError=e=>finish(e),onClose=()=>finish(Error("Connection closed"));
  const onData=chunk=>{data=Buffer.concat([data,chunk]);if(data.length<4)return;const n=data.readUInt32BE(0);if(n>MAX)return finish(Error("Oversized frame"));if(data.length>=n+4){try{finish(null,JSON.parse(data.subarray(4,n+4).toString("utf8")))}catch(e){finish(e)}}};
  socket.on("data",onData);socket.once("error",onError);socket.once("close",onClose);
 });
}
async function startRelay({relayId,key,port=0,maxReplay=10000,replayDirectory}){
 if(!relayId||!Buffer.isBuffer(key)||key.length!==32||!Number.isInteger(maxReplay)||maxReplay<1)throw Error("Invalid relay configuration");
 const messages=[],seen=new Set();
 const replayGuard=replayDirectory?createReplayGuard(replayDirectory):null;
 const server=net.createServer(socket=>{
  socket.setTimeout(3000,()=>socket.destroy());
  (async()=>{
   try{
    const x=await readFrame(socket);
    if(x.relayId!==relayId)throw Error("Relay mismatch");
    const payload=decrypt(x,key);
    if(typeof payload.manifestHash!=="string"||!payload.share)throw Error("Invalid fragment");
    if(seen.has(x.messageId))throw Error("Replay");
    const payloadDigest=digest(Buffer.from(JSON.stringify(payload)));
    if(replayGuard&&!replayGuard.claim(relayId,x.messageId))throw Error("Persistent replay");
    seen.add(x.messageId);
    if(seen.size>maxReplay)seen.delete(seen.values().next().value);
    messages.push({messageId:x.messageId,...payload});
    const receipt={version:2,relayId,messageId:x.messageId,payloadDigest,accepted:true};
    receipt.mac=h(key,receiptCanonical(receipt));
    socket.end(pack(receipt));
   }catch{socket.destroy()}
  })();
 });
 await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",resolve)});
 return {server,port:server.address().port,relayId,messages};
}
async function sendEncrypted({port,relayId,key,share,manifestHash,messageId=crypto.randomBytes(16).toString("hex")}){
 const frame=encrypt({relayId,key,share,manifestHash,messageId});
 const socket=net.connect({host:"127.0.0.1",port});
 socket.setTimeout(3000,()=>socket.destroy());
 try{
  await new Promise((resolve,reject)=>{socket.once("connect",resolve);socket.once("error",reject)});
  const promise=readFrame(socket);
  socket.write(pack(frame));
  const receipt=await promise;
  const payloadDigest=digest(Buffer.from(JSON.stringify({share,manifestHash})));
  if(receipt.version!==2||receipt.relayId!==relayId||receipt.messageId!==messageId||receipt.payloadDigest!==payloadDigest||receipt.accepted!==true||!safeEqual(receipt.mac,h(key,receiptCanonical(receipt))))throw Error("Invalid authenticated receipt");
  return receipt;
 }finally{socket.destroy()}
}
module.exports={startRelay,sendEncrypted,encrypt,decrypt};
