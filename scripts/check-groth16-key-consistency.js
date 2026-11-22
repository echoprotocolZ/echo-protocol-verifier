#!/usr/bin/env node
"use strict";
/**
 * Read-only proving-key consistency check.
 * Requires local snarkjs, zkeys, and compiled Solidity verifier sources.
 * Prints only paths, hashes, and key match results; never witness contents.
 */
const fs=require("node:fs");
const crypto=require("node:crypto");
const snarkjs=require("snarkjs");
const pairs=[
 ["V3 timestamp-fixed","build/v3-timestamp-fixed/EchoAuthorizationVerifierV3_final.zkey","build/v3-timestamp-fixed/verification_key.json","contracts/EchoAuthorizationVerifierV3.sol"],
 ["V3 bound","build/v3-bound/EchoAuthorizationVerifierV3_final.zkey","build/v3-bound/verification_key.json","contracts/EchoAuthorizationVerifierV3.sol"],
 ["V3 replacement","build/v3-replacement/EchoAuthorizationVerifierV3_final.zkey","build/v3-replacement/verification_key.json","contracts/EchoAuthorizationVerifierV3.sol"],
 ["V4 geographic-bound","build/v4-geographic-bound/setup/EchoGeographicBoundV4_final.zkey","build/v4-geographic-bound/verification_key.json","contracts/EchoGeographicBoundVerifierV4.sol"]
];
const sha=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
function extractSolidityKey(source){
 const s=fs.readFileSync(source,"utf8");
 const constants={};
 for(const m of s.matchAll(/uint256 constant (\w+)\s*=\s*(\d+)\s*;/g))constants[m[1]]=BigInt(m[2]).toString();
 return constants;
}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function checkSolidity(vk,source){
 const sol=extractSolidityKey(source);
 const mapping=[
  ["alphax",vk.vk_alpha_1[0]],["alphay",vk.vk_alpha_1[1]],
  ["betax1",vk.vk_beta_2[0][1]],["betax2",vk.vk_beta_2[0][0]],
  ["betay1",vk.vk_beta_2[1][1]],["betay2",vk.vk_beta_2[1][0]],
  ["gammax1",vk.vk_gamma_2[0][1]],["gammax2",vk.vk_gamma_2[0][0]],
  ["gammay1",vk.vk_gamma_2[1][1]],["gammay2",vk.vk_gamma_2[1][0]],
  ["deltax1",vk.vk_delta_2[0][1]],["deltax2",vk.vk_delta_2[0][0]],
  ["deltay1",vk.vk_delta_2[1][1]],["deltay2",vk.vk_delta_2[1][0]]
 ];
 for(let i=0;i<vk.IC.length;i++){
  mapping.push(["IC"+i+"x",vk.IC[i][0]],["IC"+i+"y",vk.IC[i][1]]);
 }
 const mismatches=mapping.filter(([k,v])=>sol[k]!==BigInt(v).toString()).map(([k])=>k);
 return {checked:mapping.length,mismatches};
}
(async()=>{
 let failures=0;
 for(const [label,zkey,vkey,sol] of pairs){
  console.log("\n"+label);
  if(![zkey,vkey,sol].every(fs.existsSync)){console.log("MISSING FILE");failures++;continue;}
  try{
   const exported=await snarkjs.zKey.exportVerificationKey(zkey);
   const stored=JSON.parse(fs.readFileSync(vkey,"utf8"));
   const solCheck=checkSolidity(exported,sol);
   const keys=["protocol","curve","nPublic","vk_alpha_1","vk_beta_2","vk_gamma_2","vk_delta_2","IC"];
   const storedMatch=keys.every(k=>same(exported[k],stored[k]));
   console.log("zkey SHA256:",sha(zkey));
   console.log("exported key matches stored JSON:",storedMatch);
   console.log("exported key matches Solidity:",solCheck.mismatches.length===0,
               "("+solCheck.checked+" coordinates checked)");
   if(solCheck.mismatches.length)console.log("mismatched coordinates:",solCheck.mismatches.join(", "));
   if(!storedMatch||solCheck.mismatches.length)failures++;
  }catch(e){console.log("CHECK ERROR:",e.message);failures++;}
 }
 console.log("\n"+(failures?"ATTENTION: "+failures+" candidate(s) failed checks.":"All candidate keys match."));
 process.exitCode=failures?1:0;
})().catch(e=>{console.error(e.message);process.exitCode=1});
