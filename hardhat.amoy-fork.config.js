"use strict";
// Hardhat 2.29-compatible local-only config. Do not include unsupported chains field.
const base=require("./hardhat.config.js");
module.exports={
 ...base,
 networks:{
  ...base.networks,
  hardhat:{
   chainId:80002,
   hardfork:"cancun",
   allowUnlimitedContractSize:false
  }
 }
};
