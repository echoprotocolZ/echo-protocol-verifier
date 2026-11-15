"use strict";
/**
 * Echo Logic v3 local keyed-envelope format.
 * Key IDs are authenticated as AES-GCM associated data. Keyring resolves
 * only installed keys; retired IDs fail closed. This is an offline envelope
 * primitive, not a network service or a public-network security claim.
 */
const crypto=require("node:crypto");
const {RelayKeyring}=require("./relay-keyring");
function encode({keyring,relayId,messageId,share,manifestHash}){
 if(!(keyring instanceof RelayKeyring)||keyring.relayId!==relayId)throw Error("Relay keyring mismatch");
 if(typeof messageId!=="string"||!/^[0-9a-f]{32}$/.test(messageId))throw Error("Invalid message ID");
 const {keyId,key}=keyring.active();
 const iv=crypto.randomBytes(12);
 const header={version:3,relayId,keyId,messageId};
 const cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
 cipher.setAAD(Buffer.from(JSON.stringify(header)));
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify({share,manifestHash}),"utf8"),cipher.final()]);
 return {...header,iv:iv.toString("hex"),ciphertext:ciphertext.toString("base64"),tag:cipher.getAuthTag().toString("hex")};
}
function decode(envelope,keyring){
 if(!(keyring instanceof RelayKeyring)||!envelope||envelope.version!==3||envelope.relayId!==keyring.relayId)throw Error("Relay keyring mismatch");
 const {relayId,keyId,messageId,iv,ciphertext,tag}=envelope;
 if(typeof keyId!=="string"||typeof messageId!=="string"||!/^[0-9a-f]{32}$/.test(messageId)||typeof iv!=="string"||!/^[0-9a-f]{24}$/.test(iv)||typeof tag!=="string"||!/^[0-9a-f]{32}$/.test(tag)||typeof ciphertext!=="string")throw Error("Malformed envelope");
 const key=keyring.resolve(keyId);
 const decipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(iv,"hex"));
 decipher.setAAD(Buffer.from(JSON.stringify({version:3,relayId,keyId,messageId})));
 decipher.setAuthTag(Buffer.from(tag,"hex"));
 const payload=JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext,"base64")),decipher.final()]).toString("utf8"));
 if(!payload||!payload.share||typeof payload.manifestHash!=="string")throw Error("Invalid decrypted payload");
 return payload;
}
module.exports={encode,decode};
