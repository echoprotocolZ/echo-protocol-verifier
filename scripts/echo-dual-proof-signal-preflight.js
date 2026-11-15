#!/usr/bin/env node
"use strict";
// Read-only dual-proof public-signal compatibility audit.
// Does not generate a checkpoint signature or claim on-chain authorization.
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8")).map(x=>BigInt(x));
const v3=read("build/v4-geographic-bound/proofs/v3-amoy-matching-public.json");
const v4=read("build/v4-geographic-bound/proofs/approved-zone-public.json");
const failures=[];
function check(label,ok){console.log((ok?"PASS":"FAIL")+" "+label);if(!ok)failures.push(label);}
if(v3.length!==20||v4.length!==5)throw Error("Expected V3 20 signals and V4 5 signals");
console.log("Echo Protocol Z — V3/V4 public-signal authorization preflight");
check("Shared checkpoint commitment: V3[18] == V4[4]",v3[18]===v4[4]);
check("Nonzero checkpoint commitment",v3[18]!==0n);
check("Nonzero authorization commitment",v3[1]!==0n);
check("Nonzero nullifier",v3[2]!==0n);
check("Nonzero account",v3[3]!==0n&&v3[3]<(1n<<160n));
check("Nonzero delegatee",v3[4]!==0n&&v3[4]<(1n<<160n));
check("Nonzero validator",v3[5]!==0n&&v3[5]<(1n<<160n));
check("Nonzero target",v3[6]!==0n&&v3[6]<(1n<<160n));
check("Valid V3 timestamp window",v3[16]<=v3[17]&&v3[19]>=v3[16]&&v3[19]<=v3[17]);
check("Nonzero expiry",v3[12]!==0n);
check("V4 latitude bounds",v4[0]<=v4[1]&&v4[1]<=1800000000n);
check("V4 longitude bounds",v4[2]<=v4[3]&&v4[3]<=3600000000n);
console.log("\nTransaction and checkpoint fields (public signals only):");
for(const [label,i] of [["account",3],["delegatee",4],["validator",5],["target",6],["value",7],["chainId",10],["nonce",11],["expiry",12],["timestamp",19]])
 console.log(" "+label+" V3["+i+"]="+v3[i]);
console.log(" checkpoint commitment="+v3[18]);
console.log(" zone bounds="+v4.slice(0,4).join(","));
console.log("\nRESULT: "+(failures.length?failures.length+" structural checks failed":"structural signal checks passed"));
console.log("Still required: actual checkpoint zoneHash, trusted validator signature,");
console.log("account and chain compatibility, policy setup, matching on-chain");
console.log("verifier keys, and successful execution with replay rejection.");
if(failures.length)process.exitCode=1;
