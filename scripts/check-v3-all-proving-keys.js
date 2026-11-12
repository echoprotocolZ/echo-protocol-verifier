#!/usr/bin/env node
"use strict";
// Read-only comparison of V3 proving keys against the current Solidity verifier.
// Does not modify contracts, keys, or witnesses.
const fs=require("node:fs");
const snarkjs=require("snarkjs");
const candidates=[
 ["timestamp-fixed","build/v3-timestamp-fixed/EchoAuthorizationVerifierV3_final.zkey"],
 ["bound","build/v3-bound/EchoAuthorizationVerifierV3_final.zkey"],
 ["replacement","build/v3-replacement/EchoAuthorizationVerifierV3_final.zkey"],
 ["backup timestamp fix","backups/echo-v3-timestamp-fix/EchoAuthorizationVerifierV3_final.zkey"]
];
const source=fs.readFileSync("contracts/EchoAuthorizationVerifierV3.sol","utf8");
const sol={};
for(const m of source.matchAll(/uint256 constant (\w+)\s*=\s*(\d+)\s*;/g))sol[m[1]]=m[2];
function mapping(vk){
 const pairs=[
 ["alphax",vk.vk_alpha_1[0]],["alphay",vk.vk_alpha_1[1]],
 ["betax1",vk.vk_beta_2[0][1]],["betax2",vk.vk_beta_2[0][0]],
 ["betay1",vk.vk_beta_2[1][1]],["betay2",vk.vk_beta_2[1][0]],
 ["gammax1",vk.vk_gamma_2[0][1]],["gammax2",vk.vk_gamma_2[0][0]],
 ["gammay1",vk.vk_gamma_2[1][1]],["gammay2",vk.vk_gamma_2[1][0]],
 ["deltax1",vk.vk_delta_2[0][1]],["deltax2",vk.vk_delta_2[0][0]],
 ["deltay1",vk.vk_delta_2[1][1]],["deltay2",vk.vk_delta_2[1][0]]
 ];
 for(let i=0;i<vk.IC.length;i++)pairs.push(["IC"+i+"x",vk.IC[i][0]],["IC"+i+"y",vk.IC[i][1]]);
 return pairs;
}
(async()=>{
 for(const [name,file] of candidates){
  if(!fs.existsSync(file)){console.log(name+": missing");continue;}
  try{
   const vk=await snarkjs.zKey.exportVerificationKey(file);
   const entries=mapping(vk);
   const differences=entries.filter(([key,value])=>sol[key]!==BigInt(value).toString()).map(([key])=>key);
   console.log(name+": "+(differences.length?"MISMATCH":"MATCH")+" ("+entries.length+" coordinates)");
   if(differences.length)console.log("  mismatched: "+differences.join(", "));
  }catch(e){console.log(name+": ERROR "+e.message)}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
