"use strict";
/**
 * Echo Logic isolated relay worker for local development.
 * Each child process owns its own keyring and TCP listener.
 * The parent provisions a random test key through IPC; never use IPC
 * provisioning as a production key-management mechanism.
 */
const {RelayKeyring}=require("./relay-keyring");
const {startKeyedRelay}=require("./keyed-tcp-relay");
let instance=null;
process.on("message",async msg=>{
 try{
  if(!msg||typeof msg!=="object")throw Error("Invalid command");
  if(msg.type==="start"){
   if(instance)throw Error("Already started");
   if(typeof msg.relayId!=="string"||typeof msg.keyHex!=="string"||!/^[0-9a-f]{64}$/.test(msg.keyHex))throw Error("Invalid provisioning");
   const ring=new RelayKeyring(msg.relayId);
   ring.add("v1",Buffer.from(msg.keyHex,"hex"));
   instance=await startKeyedRelay({keyring:ring,port:0,replayDirectory:msg.replayDirectory});
   process.send?.({type:"ready",relayId:msg.relayId,port:instance.port,pid:process.pid});
  }else if(msg.type==="stats"){
   if(!instance)throw Error("Not started");
   process.send?.({type:"stats",relayId:msg.relayId,count:instance.messages.length,shares:instance.messages.map(m=>m.share)});
  }else if(msg.type==="stop"){
   if(instance)await new Promise(resolve=>instance.server.close(resolve));
   process.send?.({type:"stopped"});
   process.exit(0);
  }else throw Error("Unknown command");
 }catch(e){process.send?.({type:"error",message:e.message})}
});
