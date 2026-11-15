"use strict";
/**
 * Echo Logic keyed TCP relay v3: loopback-only prototype.
 * Key ID is AES-GCM authenticated data. Receipt MAC is bound to key ID,
 * relay ID, message ID and SHA-256 digest of the received payload.
 * Persistent replay claims are optional and require private durable storage.
 */
const net=require("node:net");
const crypto=require("node:crypto");
const {RelayKeyring}=require("./relay-keyring");
const {encode,decode}=require("./keyed-envelope");
const {createReplayGuard}=require("./durable-replay-guard");
const LIMIT=2*1024*1024;
const digest=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const receiptBody=r=>JSON.stringify([r.version,r.relayId,r.keyId,r.messageId,r.payloadDigest,r.accepted]);
const mac=(key,r)=>crypto.createHmac("sha256",key).update(receiptBody(r)).digest("hex");
function timingEqual(a,b){return typeof a==="string"&&/^[0-9a-f]{64}$/.test(a)&&crypto.timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"))}
function pack(value){const data=Buffer.from(JSON.stringify(value));if(data.length>LIMIT)throw Error("Frame too large");const size=Buffer.alloc(4);size.writeUInt32BE(data.length);return Buffer.concat([size,data])}
function read(socket){
 return new Promise((resolve,reject)=>{
  let data=Buffer.alloc(0),done=false;
  function finish(err,value){if(done)return;done=true;socket.off("data",onData);socket.off("error",onError);socket.off("close",onClose);err?reject(err):resolve(value)}
  function onError(e){finish(e)}
  function onClose(){finish(Error("Connection closed"))}
  function onData(chunk){data=Buffer.concat([data,chunk]);if(data.length<4)return;const size=data.readUInt32BE(0);if(size>LIMIT)return finish(Error("Oversized frame"));if(data.length>=size+4){try{finish(null,JSON.parse(data.subarray(4,size+4).toString("utf8")))}catch(e){finish(e)}}}
  socket.on("data",onData);socket.once("error",onError);socket.once("close",onClose);
 });
}
function verifyKeyedReceipt(receipt,{keyring,relayId,keyId,messageId,share,manifestHash}){
 if(!(keyring instanceof RelayKeyring)||keyring.relayId!==relayId)throw Error("Relay keyring mismatch");
 const expectedDigest=digest({share,manifestHash});
 if(!receipt||receipt.version!==3||receipt.relayId!==relayId||receipt.keyId!==keyId||receipt.messageId!==messageId||receipt.payloadDigest!==expectedDigest||receipt.accepted!==true)throw Error("Invalid keyed receipt");
 const key=keyring.resolve(keyId);
 if(!timingEqual(receipt.mac,mac(key,receipt)))throw Error("Invalid keyed receipt MAC");
 return true;
}
async function startKeyedRelay({keyring,port=0,replayDirectory}){
 if(!(keyring instanceof RelayKeyring))throw Error("Keyring required");
 const messages=[],seen=new Set(),guard=replayDirectory?createReplayGuard(replayDirectory):null;
 const server=net.createServer(socket=>{
  socket.setTimeout(3000,()=>socket.destroy());
  (async()=>{try{
   const envelope=await read(socket);
   const payload=decode(envelope,keyring);
   if(seen.has(envelope.messageId))throw Error("Replay");
   const key=keyring.resolve(envelope.keyId);
   if(guard&&!guard.claim(keyring.relayId,envelope.messageId))throw Error("Persistent replay");
   seen.add(envelope.messageId);
   messages.push({keyId:envelope.keyId,messageId:envelope.messageId,...payload});
   const receipt={version:3,relayId:keyring.relayId,keyId:envelope.keyId,messageId:envelope.messageId,payloadDigest:digest(payload),accepted:true};
   receipt.mac=mac(key,receipt);
   socket.end(pack(receipt));
  }catch{socket.destroy()}})();
 });
 await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",resolve)});
 return {server,port:server.address().port,messages};
}
async function sendKeyed({port,keyring,share,manifestHash,messageId=crypto.randomBytes(16).toString("hex")}){
 const {keyId}=keyring.active();
 const envelope=encode({keyring,relayId:keyring.relayId,messageId,share,manifestHash});
 const socket=net.connect({host:"127.0.0.1",port});
 socket.setTimeout(3000,()=>socket.destroy());
 try{
  await new Promise((resolve,reject)=>{socket.once("connect",resolve);socket.once("error",reject)});
  const response=read(socket);
  socket.write(pack(envelope));
  const receipt=await response;
  verifyKeyedReceipt(receipt,{keyring,relayId:keyring.relayId,keyId,messageId,share,manifestHash});
  return receipt;
 }finally{socket.destroy()}
}
module.exports={startKeyedRelay,sendKeyed,verifyKeyedReceipt};
