#!/usr/bin/env node
"use strict";
// Replacement-account local-only preflight. Hardhat in-memory chain; no Amoy transactions.
const assert=require("node:assert/strict");
const hre=require("hardhat");
async function main(){
 if(hre.network.name!=="hardhat")throw Error("LOCAL ONLY: run with --network hardhat");
 const {ethers,network}=hre;
 const [owner,outsider]=await ethers.getSigners();
 const bridge=ethers.Wallet.createRandom().address;
 await network.provider.send("hardhat_setCode",[bridge,"0x60006000f3"]);
 const factory=await ethers.getContractFactory("EchoSmartAccountV4");
 const account=await factory.deploy(owner.address,ethers.ZeroAddress,bridge);
 await account.waitForDeployment();
 const initial={owner:await account.owner(),pending:await account.pendingOwner(),entry:await account.entryPoint(),nonce:await account.nonce()};
 assert.equal(initial.owner,owner.address);
 assert.equal(initial.pending,ethers.ZeroAddress);
 assert.equal(initial.entry,ethers.ZeroAddress);
 const cases=[
  ["owner transferOwnership",account.connect(owner).transferOwnership(outsider.address)],
  ["outsider transferOwnership",account.connect(outsider).transferOwnership(outsider.address)],
  ["owner acceptOwnership",account.connect(owner).acceptOwnership()],
  ["owner setEntryPoint",account.connect(owner).setEntryPoint(outsider.address)],
  ["owner executeAdministration",account.connect(owner).executeAdministration(outsider.address,"0x")],
  ["owner executeGeographicAdministration",account.connect(owner).executeGeographicAdministration("0x")]
 ];
 for(const [label,promise] of cases){
  let rejected=false;
  try{const tx=await promise;await tx.wait()}
  catch(e){if(e.code==="CALL_EXCEPTION"||/revert|Unauthorized/i.test(e.shortMessage||e.message||""))rejected=true;else throw e}
  assert.ok(rejected,"CRITICAL: "+label+" unexpectedly succeeded");
  console.log("PASS",label,"rejected");
 }
 assert.equal(await account.owner(),initial.owner);
 assert.equal(await account.pendingOwner(),initial.pending);
 assert.equal(await account.entryPoint(),initial.entry);
 assert.equal(await account.nonce(),initial.nonce);
 console.log("PASS local replacement administration state unchanged");
 console.log("LOCAL REPLACEMENT ADMINISTRATION PREFLIGHT PASSED");
 console.log("LIMITATION: This does not verify replacement account proof execution or bridge registration.");
 console.log("Live deployment: NO; live POL spent: 0");
}
main().catch(e=>{console.error("BLOCKED:",e.message);process.exitCode=1});
