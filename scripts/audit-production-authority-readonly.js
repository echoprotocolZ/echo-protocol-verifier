"use strict";
const { ethers } = require("ethers");
const targets = {
 token: ["0x9511Ee84398B8Deb725d8967c16693C96C43e0eD", ["owner() view returns(address)", "totalSupply() view returns(uint256)", "decimals() view returns(uint8)"]],
 staking: ["0x11bddDCE9770687675Afdef5AA9F001fcC837E4B", ["owner() view returns(address)", "echoToken() view returns(address)", "registryAddress() view returns(address)", "forensicOracle() view returns(address)", "paused() view returns(bool)", "totalStaked() view returns(uint256)", "rewardPool() view returns(uint256)", "minimumStake() view returns(uint256)"]],
 registry: ["0x25DB74bbDa04F5a83b386f74Bb16B929f1419B31", ["owner() view returns(address)"]],
 paymaster: ["0x1A69eA821C497B4D2908f972b918664dF17A9bC4", ["owner() view returns(address)", "entryPoint() view returns(address)", "echoToken() view returns(address)"]],
 delegationProxy: ["0x93Fb207D8832a8A2914194098901b8e1B39a04C1", ["owner() view returns(address)", "entryPoint() view returns(address)", "registry() view returns(address)"]]
};
async function main() {
 if (!process.env.POLYGON_RPC_URL) throw Error("POLYGON_RPC_URL required");
 const p = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL, 137, {staticNetwork:true,batchMaxCount:1});
 try {
  if (BigInt(await p.send("eth_chainId", [])) !== 137n) throw Error("Wrong chain");
  const block = await p.getBlock("latest");
  if (!block?.hash) throw Error("Missing snapshot block");
  const report = {chainId:137,blockNumber:block.number,blockHash:block.hash,contracts:{}};
  for (const [label,[raw,methods]] of Object.entries(targets)) {
   const address = ethers.getAddress(raw.toLowerCase());
   const code = await p.getCode(address,block.number);
   if (code === "0x") throw Error("Missing runtime: "+label);
   const row = report.contracts[label] = {address,runtimeHash:ethers.keccak256(code),runtimeBytes:(code.length-2)/2,reads:{}};
   const c = new ethers.Contract(address,methods.map(m=>"function "+m),p);
   for (const method of methods) {
    const name = method.split("(")[0];
    try {row.reads[name]={status:"read",value:String(await c[name].staticCall({blockTag:block.number}))};}
    catch(e) {row.reads[name]={status:"unresolved",error:e.code || "UNKNOWN"};}
   }
  }
  if ((await p.getBlock(block.number))?.hash !== block.hash) throw Error("Snapshot reorg");
  console.log(JSON.stringify(report,null,2));
  console.log("Inventory only: unresolved getters do not establish absence of privileges; ABI/source review and independent provider comparison required.");
 } finally {p.destroy();}
}
main().catch(e=>{console.error("Inventory blocked:",e.code||e.message);process.exitCode=1;});
