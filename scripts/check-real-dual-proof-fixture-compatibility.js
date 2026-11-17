#!/usr/bin/env node
"use strict";
// Read-only compatibility preflight for genuine saved V3/V4 proof fixtures.
// This does not claim that the fixtures authorize the same transaction.
const fs=require("node:fs");
const snarkjs=require("snarkjs");
const {ethers}=require("ethers");
const v3base="build/v3-timestamp-fixed";
const v4base="build/v4-geographic-bound";
const v3key=v3base+"/EchoAuthorizationVerifierV3_final.zkey";
const v4key=v4base+"/setup/EchoGeographicBoundV4_final.zkey";
const v4witness=v4base+"/tests/valid-checkpoint.wtns";
function need(p){if(!fs.existsSync(p)||fs.statSync(p).size===0)throw Error("Missing or empty: "+p)}
(async()=>{
 for(const p of [v3key,v3base+"/proof.json",v3base+"/public.json",v4key,v4witness])need(p);
 const v3proof=JSON.parse(fs.readFileSync(v3base+"/proof.json","utf8"));
 const v3signals=JSON.parse(fs.readFileSync(v3base+"/public.json","utf8")).map(BigInt);
 const v3vk=await snarkjs.zKey.exportVerificationKey(v3key);
 if(!(await snarkjs.groth16.verify(v3vk,v3signals.map(String),v3proof)))throw Error("V3 fixture failed verification");
 const {proof:v4proof,publicSignals:v4public}=await snarkjs.groth16.prove(v4key,v4witness);
 const v4signals=v4public.map(BigInt);
 const v4vk=await snarkjs.zKey.exportVerificationKey(v4key);
 if(!(await snarkjs.groth16.verify(v4vk,v4public,v4proof)))throw Error("V4 fixture failed verification");
 if(v3signals.length!==20||v4signals.length!==5)throw Error("Unexpected public signal counts");
 const equal=v3signals[18]===v4signals[4];
 const bounds=v4signals.slice(0,4);
 const ordered=bounds[0]<=bounds[1]&&bounds[2]<=bounds[3];
 const inRange=bounds[0]<=1800000000n&&bounds[1]<=1800000000n&&bounds[2]<=3600000000n&&bounds[3]<=3600000000n;
 const typehash=ethers.keccak256(ethers.toUtf8Bytes("ECHO_V4_GEOGRAPHIC_ZONE_V1"));
 const zoneHash=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32","uint32","uint32","uint32","uint32"],[typehash,...bounds]));
 console.log("V3 proof verified: true");
 console.log("V4 proof verified: true");
 console.log("V3 checkpoint commitment:",ethers.toBeHex(v3signals[18],32));
 console.log("V4 checkpoint commitment:",ethers.toBeHex(v4signals[4],32));
 console.log("Checkpoint commitments match:",equal);
 console.log("V4 geographic bounds ordered:",ordered);
 console.log("V4 geographic bounds in range:",inRange);
 console.log("V4 signed zone hash candidate:",zoneHash);
 console.log("V3 account public signal:",ethers.toBeHex(v3signals[3],20));
 console.log("V3 delegatee public signal:",ethers.toBeHex(v3signals[4],20));
 console.log("V3 chain ID public signal:",v3signals[10].toString());
 console.log("V3 nonce public signal:",v3signals[11].toString());
 console.log("V3 deadline public signal:",v3signals[12].toString());
 console.log("V3 timestamp public signal:",v3signals[19].toString());
 if(!equal)console.log("BLOCKER: Existing valid proofs bind different checkpoints. Generate coordinated witnesses before end-to-end execution.");
 if(!ordered||!inRange)console.log("BLOCKER: V4 zone bounds are invalid.");
 console.log("Preflight only: signature, policy, nullifier, transaction binding and smart-account execution remain untested.");
 if(!equal||!ordered||!inRange)process.exitCode=2;
})().catch(e=>{console.error("PREFLIGHT ERROR:",e.message);process.exitCode=1});
