"use strict";
/**
 * Echo Logic development keyring.
 * Per-relay AES-256 keys, explicit key IDs, rotation and retirement.
 * No KMS, secure enclave, remote key exchange or persistence.
 * Do not commit real secrets; load them from protected runtime configuration.
 */
const crypto=require("node:crypto");
const ID=/^[A-Za-z0-9_-]{1,64}$/;
class RelayKeyring{
 constructor(relayId){
  if(typeof relayId!=="string"||!ID.test(relayId))throw Error("Invalid relay ID");
  this.relayId=relayId;
  this.keys=new Map();
  this.activeId=null;
 }
 add(keyId,key,{activate=false}={}){
  if(typeof keyId!=="string"||!ID.test(keyId))throw Error("Invalid key ID");
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error("Expected 32-byte key");
  if(this.keys.has(keyId))throw Error("Key ID already registered");
  this.keys.set(keyId,Buffer.from(key));
  if(activate||this.activeId===null)this.activeId=keyId;
  return keyId;
 }
 rotate(keyId,key=crypto.randomBytes(32)){
  this.add(keyId,key,{activate:true});
  return keyId;
 }
 active(){
  if(!this.activeId)throw Error("No active key");
  return {keyId:this.activeId,key:Buffer.from(this.keys.get(this.activeId))};
 }
 resolve(keyId){
  if(typeof keyId!=="string"||!this.keys.has(keyId))throw Error("Unknown or retired key ID");
  return Buffer.from(this.keys.get(keyId));
 }
 retire(keyId){
  if(!this.keys.has(keyId))throw Error("Unknown key ID");
  if(this.activeId===keyId)throw Error("Cannot retire active key: rotate first");
  const key=this.keys.get(keyId);
  key.fill(0);
  this.keys.delete(keyId);
 }
}
function loadKeyFromEnvironment(variableName,env=process.env){
 if(typeof variableName!=="string"||!/^ECHO_RELAY_KEY_[A-Z0-9_]+$/.test(variableName))throw Error("Invalid key environment variable");
 const raw=env[variableName];
 if(typeof raw!=="string"||!/^[a-fA-F0-9]{64}$/.test(raw))throw Error("Expected 64 hexadecimal characters in protected environment variable");
 return Buffer.from(raw,"hex");
}
module.exports={RelayKeyring,loadKeyFromEnvironment};
