#!/usr/bin/env node
"use strict";
// Read-only live readiness gate for regenerated V3 and existing V4 fixtures.
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const load=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const v3=load("build/v4-geographic-bound/proofs/v3-amoy-matching-public.json");
const v4=load("build/v4-geographic-bound/proofs/approved-zone-public.json");
const input=load("build/v4-geographic-bound/proofs/v3-amoy-authorization-input.json");
let failed=0;
function check(label,ok){console.log((ok?"PASS":"FAIL")+" "+label);if(!ok)failed++;}
const bi=x=>BigInt(x);
if(v3.length!==20||v4.length!==5)throw Error("Expected 20 V3 and 5 V4 public signals");
const now=BigInt(Math.floor(Date.now()/1000));
console.log("Echo Protocol Z — regenerated proof authorization readiness");
console.log("now="+now+" expiry="+v3[12]+" timestamp="+v3[19]);
check("V3/V4 checkpoint commitment",bi(v3[18])===bi(v4[4]));
check("Proof is not expired",now<=bi(v3[12]));
check("Proof is not premature",now>=bi(v3[19]));
check("Amoy chain binding",bi(v3[10])===80002n);
check("Account matches prepared input",bi(v3[3])===bi(input.account));
check("Delegatee matches prepared input",bi(v3[4])===bi(input.delegatee));
check("Validator matches prepared input",bi(v3[5])===bi(input.validator));
check("Target matches prepared input",bi(v3[6])===bi(input.target));
check("Nonce matches prepared input",bi(v3[11])===bi(input.nonce));
check("Expiry matches prepared input",bi(v3[12])===bi(input.deadline));
check("Checkpoint commitment matches prepared input",bi(v3[18])===bi(input.expectedCheckpointCommitment));
console.log("\nSUMMARY: "+(11-failed)+"/11 checks passed");
console.log("This is OFF-CHAIN readiness only; it does not verify signature, policy,");
console.log("live nonce, bridge consumption, on-chain V4 verifier, or execution.");
if(failed)process.exitCode=1;
