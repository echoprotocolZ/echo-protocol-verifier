"use strict";
/**
 * Echo Logic in-memory relay simulation. No sockets, peers, anonymity,
 * physical-location proof, signatures, or blockchain transactions.
 * One share per independent simulated relay. Explicitly trusted manifestHash.
 */
const {createFragments,reconstruct}=require("./threshold-fragments");

class RelayNetwork {
 constructor(nodeIds){
  if(!Array.isArray(nodeIds)||nodeIds.length<2||nodeIds.some(id=>typeof id!=="string"||!id)||new Set(nodeIds).size!==nodeIds.length)throw Error("Distinct relay node IDs required");
  this.nodes=new Map(nodeIds.map(id=>[id,{online:true,queue:[]}]));
  this.deliveries=new Set();
 }
 setOnline(id,online){const node=this.nodes.get(id);if(!node)throw Error("Unknown relay");node.online=Boolean(online)}
 /**
  * Schedule each fragment on a distinct relay. An optional deterministic
  * per-relay fault map supports drop, delay, or byte corruption.
  */
 dispatch(payload,options,{start=0,delay=0,faults={}}={}){
  if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(delay)||delay<0)throw Error("Invalid schedule");
  if(options.total>this.nodes.size)throw Error("Not enough independent relays");
  const bundle=createFragments(payload,options);
  const ids=[...this.nodes.keys()].slice(0,options.total);
  ids.forEach((id,i)=>{
   const fault=faults[id]||{};
   if(fault.drop)return;
   const extra=fault.delay||0;
   if(!Number.isSafeInteger(extra)||extra<0)throw Error("Invalid relay delay");
   const share={...bundle.shares[i]};
   if(fault.corrupt){
    const bytes=Buffer.from(share.data,"base64");
    bytes[0]^=1;
    share.data=bytes.toString("base64");
   }
   this.nodes.get(id).queue.push({manifestHash:bundle.manifestHash,share,arriveAt:start+delay+extra});
  });
  return {manifest:bundle.manifest,manifestHash:bundle.manifestHash,assignedRelays:ids};
 }
 /**
  * Only packets that have arrived and belong to this manifest are considered.
  * Corrupt shares are discarded; healthy shares can still reach threshold.
  * Delivery replay is blocked for this simulator instance only.
  */
 receive(bundle,context){
  if(!Number.isSafeInteger(context.now)||context.now<0)throw Error("Invalid receive time");
  const key=bundle.manifestHash+"|"+context.account.toLowerCase()+"|"+context.destination.toLowerCase();
  if(this.deliveries.has(key))throw Error("Replay: manifest already delivered");
  const candidates=[];
  for(const [id,node] of this.nodes){
   if(!node.online)continue;
   for(const packet of node.queue){
    if(packet.manifestHash!==bundle.manifestHash||packet.arriveAt>context.now)continue;
    candidates.push({relay:id,share:packet.share});
   }
  }
  const accepted=[];
  for(const packet of candidates){
   try{
    // Check each share against the full trusted manifest, before collecting.
    // Insufficient-fragments is expected for one share; other failures reject it.
    const f=packet.share;
    const idx=f.index;
    const expected=bundle.manifest.shareHashes[idx-1];
    const bytes=Buffer.from(f.data,"base64");
    const crypto=require("node:crypto");
    const digest=crypto.createHash("sha256").update(Buffer.concat([Buffer.from([idx]),bytes])).digest("hex");
    if(!Number.isInteger(idx)||idx<1||idx>bundle.manifest.total||digest!==expected||bytes.length!==bundle.manifest.length||bytes.toString("base64")!==f.data||f.manifestHash!==bundle.manifestHash)continue;
    if(!accepted.some(s=>s.index===idx))accepted.push(f);
   }catch{continue}
  }
  const result=reconstruct(bundle.manifest,bundle.manifestHash,accepted,context);
  this.deliveries.add(key);
  return {payload:result,relaysUsed:accepted.slice(0,bundle.manifest.threshold).map(s=>bundle.assignedRelays[s.index-1]),fragmentsReceived:accepted.length};
 }
}
module.exports={RelayNetwork};
