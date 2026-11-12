#!/usr/bin/env node
/**
 * Read-only exact runtime verification against verified-source compilation.
 * Applies known immutable references from the compiler output to the deployed
 * constructor value, then compares EVERY byte against live Polygon runtime.
 */
const fs=require("node:fs"),path=require("node:path"),{ethers}=require("ethers");
const STAKING="0x11bddDCE9770687675Afdef5AA9F001fcC837E4B";
const TOKEN="0x9511Ee84398B8Deb725d8967c16693C96C43e0eD";
const outputFile=path.resolve(__dirname,"../production-evidence/compiler-output.json");
async function main(){
 const url=process.env.POLYGON_RPC_URL;
 if(!url||!/^https?:\/\//i.test(url))throw Error("Set POLYGON_RPC_URL to an actual Polygon RPC URL");
 const raw=fs.readFileSync(outputFile,"utf8"),idx=raw.indexOf("{");
 if(idx<0)throw Error("Compiler output JSON missing");
 const parsed=JSON.parse(raw.slice(idx));
 const errors=(parsed.errors||[]).filter(x=>x.severity==="error");
 if(errors.length)throw Error(errors.map(x=>x.formattedMessage).join("\n"));
 const artifact=parsed.contracts?.["contracts/EchoStaking.sol"]?.EchoStaking;
 if(!artifact)throw Error("Compiled EchoStaking missing");
 const compiled=artifact.evm?.deployedBytecode;
 if(!compiled?.object)throw Error("Compiled runtime missing");
 const refs=compiled.immutableReferences||{};
 const ids=Object.keys(refs);
 if(ids.length!==1)throw Error("Expected exactly one immutable variable; got "+ids.length);
 const positions=refs[ids[0]];
 const provider=new ethers.JsonRpcProvider(url);
 if((await provider.getNetwork()).chainId!==137n)throw Error("Not Polygon mainnet");
 const live=(await provider.getCode(STAKING)).slice(2).toLowerCase();
 if(!live)throw Error("No deployed code");
 const token=(await new ethers.Contract(STAKING,["function echoToken() view returns (address)"],provider).echoToken()).toLowerCase();
 if(token!==TOKEN.toLowerCase())throw Error("On-chain ECHO token mismatch");
 let patched=compiled.object.toLowerCase().replace(/^0x/,"");
 if(patched.length!==live.length)throw Error("Runtime size mismatch: compiled "+patched.length/2+" vs deployed "+live.length/2);
 for(const {start,length} of positions){
  if(length!==32)throw Error("Unexpected immutable width: "+length);
  const bytes=ethers.zeroPadValue(TOKEN,32).slice(2).toLowerCase();
  patched=patched.slice(0,start*2)+bytes+patched.slice((start+length)*2);
 }
 const differences=[];
 for(let i=0;i<live.length;i+=2){
  if(live.slice(i,i+2)!==patched.slice(i,i+2)){
   differences.push({offsetBytes:i/2,compiled:patched.slice(i,i+2),deployed:live.slice(i,i+2)});
   if(differences.length>=12)break;
  }
 }
 const exact=patched===live;
 console.log(JSON.stringify({
  stakingAddress:STAKING,chainId:137,verifiedToken:token,
  compiledRuntimeBytes:patched.length/2,deployedRuntimeBytes:live.length/2,
  immutableSlotsPatched:positions.length,
  compiledRuntimeHashAfterImmutablePatch:ethers.keccak256("0x"+patched),
  deployedRuntimeHash:ethers.keccak256("0x"+live),
  exactRuntimeMatchAfterImmutablePatch:exact,
  firstDifferences:differences,
  note:"Exact runtime equality confirms reproduction of the currently deployed runtime from retrieved verified sources and settings. It is not an independent security audit."
 },null,2));
 if(!exact){console.error("NO-GO: byte-for-byte match not established");process.exitCode=2;}
 else console.log("PASS: deployed runtime matches verified-source compilation byte for byte after immutable substitution.");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
