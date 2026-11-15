"use strict";
/**
 * Echo Logic local relay configuration loader.
 * Explicit allowlisted bind addresses; default loopback.
 * Private-network binding is intentionally disabled until transport TLS,
 * peer authentication and threat-model review are implemented.
 * Keys are supplied through environment variables, never config JSON.
 */
const fs=require("node:fs");
const {RelayKeyring,loadKeyFromEnvironment}=require("./relay-keyring");
const RELAY=/^[A-Za-z0-9_-]{1,64}$/;
function loadRelayConfig(filename,env=process.env){
 const cfg=JSON.parse(fs.readFileSync(filename,"utf8"));
 if(!cfg||typeof cfg!=="object"||Array.isArray(cfg))throw Error("Invalid relay configuration");
 if(typeof cfg.relayId!=="string"||!RELAY.test(cfg.relayId))throw Error("Invalid relay ID");
 if(cfg.host!==undefined&&cfg.host!=="127.0.0.1")throw Error("Non-loopback binding requires future authenticated TLS transport");
 if(!Number.isInteger(cfg.port)||cfg.port<0||cfg.port>65535)throw Error("Invalid TCP port");
 if(!Array.isArray(cfg.keys)||cfg.keys.length===0)throw Error("At least one key required");
 if(typeof cfg.activeKeyId!=="string")throw Error("Active key ID required");
 const ring=new RelayKeyring(cfg.relayId);
 const seen=new Set();
 for(const entry of cfg.keys){
  if(!entry||typeof entry.keyId!=="string"||typeof entry.env!=="string"||seen.has(entry.keyId))throw Error("Duplicate or invalid key entry");
  seen.add(entry.keyId);
  ring.add(entry.keyId,loadKeyFromEnvironment(entry.env,env));
 }
 if(!seen.has(cfg.activeKeyId))throw Error("Active key ID not configured");
 // Set active key only after all entries are loaded.
 if(ring.activeId!==cfg.activeKeyId)ring.activeId=cfg.activeKeyId;
 return {host:"127.0.0.1",port:cfg.port,relayId:cfg.relayId,keyring:ring};
}
module.exports={loadRelayConfig};
