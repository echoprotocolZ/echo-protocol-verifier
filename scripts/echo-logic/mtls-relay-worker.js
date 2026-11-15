"use strict";
/**
 * Development-only isolated mTLS relay worker.
 * Each child owns a TLS listener, keyring, and relay message state.
 * PEM files and keys must be independently provisioned by test harness.
 */
const fs=require("node:fs");
const {RelayKeyring}=require("./relay-keyring");
const {startMtlsRelay}=require("./mtls-relay");
let relay;
process.on("message",async msg=>{
 try{
  if(!msg||typeof msg!=="object")throw Error("Invalid command");
  if(msg.type==="start"){
   if(relay)throw Error("Already started");
   if(typeof msg.relayId!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(msg.relayId))throw Error("Invalid relay ID");
   if(typeof msg.keyHex!=="string"||!/^[0-9a-f]{64}$/i.test(msg.keyHex))throw Error("Invalid envelope key");
   for(const field of ["tlsKeyPath","tlsCertPath","clientCaPath"])if(typeof msg[field]!=="string")throw Error("Missing "+field);
   const ring=new RelayKeyring(msg.relayId);ring.add("v1",Buffer.from(msg.keyHex,"hex"));
   relay=await startMtlsRelay({keyring:ring,tlsKey:fs.readFileSync(msg.tlsKeyPath),tlsCert:fs.readFileSync(msg.tlsCertPath),clientCa:fs.readFileSync(msg.clientCaPath),port:0});
   process.send?.({type:"ready",relayId:msg.relayId,port:relay.port,pid:process.pid});
  }else if(msg.type==="stats"){
   if(!relay)throw Error("Not started");
   process.send?.({type:"stats",count:relay.messages.length,shares:relay.messages.map(m=>m.share)});
  }else if(msg.type==="stop"){
   if(relay)await new Promise(resolve=>relay.server.close(resolve));
   process.send?.({type:"stopped"});process.exit(0);
  }else throw Error("Unknown command");
 }catch(e){process.send?.({type:"error",message:e.message})}
});
