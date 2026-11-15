"use strict";
/**
 * Localhost-only authenticated TCP relay transport for Echo Logic.
 * HMAC authenticates frames using pre-shared per-relay keys. NO encryption,
 * peer discovery, real geographic attestation, or public-network safety.
 */
const net=require("node:net");
const crypto=require("node:crypto");
const {once}=require("node:events");
const MAX_FRAME=2*1024*1024;
function canonical(obj){return JSON.stringify([obj.version,obj.relayId,obj.manifestHash,obj.share]);}
function mac(key,obj){return crypto.createHmac("sha256",key).update(canonical(obj)).digest("hex")}
function verify(key,obj){
 if(!obj||obj.version!==1||typeof obj.relayId!=="string"||typeof obj.manifestHash!=="string"||!obj.share||typeof obj.mac!=="string"||!/^[0-9a-f]{64}$/.test(obj.mac))return false;
 return crypto.timingSafeEqual(Buffer.from(mac(key,obj),"hex"),Buffer.from(obj.mac,"hex"));
}
function frame(obj){const b=Buffer.from(JSON.stringify(obj));if(b.length>MAX_FRAME)throw Error("Frame too large");const header=Buffer.alloc(4);header.writeUInt32BE(b.length);return Buffer.concat([header,b])}
function listenRelay({relayId,key,host="127.0.0.1",port=0}){
 if(host!=="127.0.0.1")throw Error("Loopback-only prototype");
 if(!relayId||!Buffer.isBuffer(key)||key.length<32)throw Error("Relay ID and 32-byte key required");
 const received=[];
 const server=net.createServer(socket=>{
  let buffer=Buffer.alloc(0),done=false;
  socket.on("data",chunk=>{
   if(done)return;
   buffer=Buffer.concat([buffer,chunk]);
   if(buffer.length>=4){
    const length=buffer.readUInt32BE(0);
    if(length>MAX_FRAME){done=true;socket.destroy();return}
    if(buffer.length>=length+4){
     done=true;
     try{
      const obj=JSON.parse(buffer.subarray(4,4+length).toString("utf8"));
      if(obj.relayId!==relayId||!verify(key,obj)){socket.end(frame({ok:false}));return}
      received.push({manifestHash:obj.manifestHash,share:obj.share,relayId});
      socket.end(frame({ok:true}));
     }catch{socket.destroy()}
    }
   }
  });
 });
 return new Promise((resolve,reject)=>{
  server.once("error",reject);
  server.listen(port,host,()=>{server.removeListener("error",reject);resolve({server,received,host,port:server.address().port,relayId})});
 });
}
function sendShare({host="127.0.0.1",port,relayId,key,manifestHash,share,timeoutMs=3000}){
 if(host!=="127.0.0.1"||!Buffer.isBuffer(key)||key.length<32)throw Error("Loopback and 32-byte key required");
 const obj={version:1,relayId,manifestHash,share};obj.mac=mac(key,obj);
 return new Promise((resolve,reject)=>{
  const socket=net.connect({host,port});
  let done=false,buffer=Buffer.alloc(0);
  const finish=(err,value)=>{if(done)return;done=true;socket.destroy();err?reject(err):resolve(value)};
  socket.setTimeout(timeoutMs,()=>finish(Error("Relay timeout")));
  socket.on("error",e=>finish(e));
  socket.on("connect",()=>socket.write(frame(obj)));
  socket.on("data",chunk=>{
   buffer=Buffer.concat([buffer,chunk]);
   if(buffer.length>=4){
    const length=buffer.readUInt32BE(0);
    if(length>MAX_FRAME)return finish(Error("Response too large"));
    if(buffer.length>=length+4){
     try{const response=JSON.parse(buffer.subarray(4,4+length).toString("utf8"));finish(null,response.ok===true)}
     catch(e){finish(e)}
    }
   }
  });
 });
}
module.exports={listenRelay,sendShare,mac,verify};
