#!/usr/bin/env node
"use strict";
// Generates a NEW V4 proof bound to the existing valid V3 checkpoint.
// Uses temporary files only; does not overwrite or commit witnesses/proofs.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const snarkjs=require("snarkjs");
const {buildPoseidon}=require("circomlibjs");
const v3="build/v3-timestamp-fixed",v4="build/v4-geographic-bound";
const files={
 input:v3+"/input-local.json",v3proof:v3+"/proof.json",v3public:v3+"/public.json",
 wasm:v4+"/EchoGeographicBoundV4_js/EchoGeographicBoundV4.wasm",
 zkey:v4+"/setup/EchoGeographicBoundV4_final.zkey"
};
(async()=>{
 for(const [name,p] of Object.entries(files))if(!fs.existsSync(p)||!fs.statSync(p).size)throw Error(name+" missing or empty: "+p);
 const input=JSON.parse(fs.readFileSync(files.input,"utf8"));
 for(const key of ["checkpointX","checkpointY","checkpointTimestamp"])if(input[key]===undefined)throw Error("V3 input missing "+key);
 const v3signals=JSON.parse(fs.readFileSync(files.v3public,"utf8"));
 const v3proof=JSON.parse(fs.readFileSync(files.v3proof,"utf8"));
 if(!(await snarkjs.groth16.verify(await snarkjs.zKey.exportVerificationKey(v3+"/EchoAuthorizationVerifierV3_final.zkey"),v3signals,v3proof)))throw Error("Existing V3 proof invalid");
 const poseidon=await buildPoseidon();
 const commitment=poseidon.F.toString(poseidon([input.checkpointX,input.checkpointY,input.checkpointTimestamp].map(BigInt)));
 if(BigInt(commitment)!==BigInt(v3signals[18]))throw Error("V3 input coordinates/timestamp DO NOT match verified V3 checkpoint commitment");
 // Exact-point zone is valid and deterministic; wider zones require explicit policy approval.
 const v4input={
  checkpointLat:String(input.checkpointX),checkpointLon:String(input.checkpointY),
  checkpointTimestamp:String(input.checkpointTimestamp),
  minLat:String(input.checkpointX),maxLat:String(input.checkpointX),
  minLon:String(input.checkpointY),maxLon:String(input.checkpointY),
  expectedCheckpointCommitment:commitment
 };
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"echo-coordinated-v4-"));
 try{
  const witness=path.join(temp,"v4.wtns");
  await snarkjs.wtns.calculate(v4input,files.wasm,witness);
  const {proof,publicSignals}=await snarkjs.groth16.prove(files.zkey,witness);
  if(!(await snarkjs.groth16.verify(await snarkjs.zKey.exportVerificationKey(files.zkey),publicSignals,proof)))throw Error("Generated V4 proof invalid");
  if(BigInt(publicSignals[4])!==BigInt(v3signals[18]))throw Error("Generated V4 checkpoint mismatch");
  console.log("V3 fixture proof: valid");
  console.log("New V4 proof: valid");
  console.log("Both checkpoint commitments match: true");
  console.log("Shared commitment: 0x"+BigInt(commitment).toString(16).padStart(64,"0"));
  console.log("Exact-point V4 geographic bounds: "+publicSignals.slice(0,4).join(", "));
  console.log("NOTE: Bridge and smart-account authorization are NOT yet established.");
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error("COORDINATED PROOF ERROR:",e.message);process.exitCode=1});
