"use strict";
// Dedicated local-only Hardhat fork config. Never supplies live signing keys.
// Polygon Amoy (80002) requires explicit EVM hardfork history for historical fork blocks.
const base=require("./hardhat.config.js");
module.exports={
 ...base,
 networks:{
  ...base.networks,
  hardhat:{
   chainId:80002,
   hardfork:"cancun",
   chains:new Map([
    [80002,{hardforkHistory:new Map([["cancun",0]])}]
   ]),
   allowUnlimitedContractSize:false
  }
 }
};
