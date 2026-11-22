"use strict";
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const { proveAuthorizedCall } = require("./helpers/echo-real-dual-proof");

describe("Echo V4 candidate: adversarial genuine dual-proof delegation", function () {
  this.timeout(240000);
  async function deploy(name,...args) { const c=await(await ethers.getContractFactory(name)).deploy(...args);await c.waitForDeployment();return c; }
  it("rejects forged signature, expired proof, wrong account, and tampered intent without state mutation",async function(){
    const [owner,validator,delegatee,outsider] = await ethers.getSigners();
    const registry=await deploy("EchoAttestationRegistryV3");
    const v3=await deploy("EchoAuthorizationVerifierV3");
    const v3bridge=await deploy("EchoAuthorizationBridgeV3",v3.target,registry.target);
    const policy=await deploy("EchoGeographicPolicyRegistryV4");
    const v4=await deploy("EchoGeographicBoundVerifierV4");
    const gateway=await deploy("EchoGeographicProofGatewayV4",v4.target,policy.target);
    const dual=await deploy("EchoDualProofVerifierV4",v3bridge.target,gateway.target);
    const bridge=await deploy("EchoAuthorizationBridgeV4",dual.target,registry.target);
    const zone={minLat:100050,maxLat:100050,minLon:200000,maxLon:200000};
    const mkAccount=()=>deploy("EchoSmartAccountV4DelegationCandidate",owner.address,ethers.ZeroAddress,bridge.target,validator.address,zone,3600n);
    const account=await mkAccount();
    const other=await mkAccount();
    const intent=await account.delegationIntent(delegatee.address,true);
    const p=await proveAuthorizedCall({account:account.target,delegatee:account.target,validator,registry:registry.target,target:account.target,data:intent,nonce:0n,zone});
    const proof={v3A:p.v3A,v3B:p.v3B,v3C:p.v3C,v3Signals:p.v3Signals,v4A:p.v4A,v4B:p.v4B,v4C:p.v4C,v4Signals:p.v4Signals};
    const check=async()=>{
      assert.equal(await account.nonce(),0n);
      assert.equal(await other.nonce(),0n);
      assert.equal(await bridge.authorizedDelegatees(account.target,delegatee.address),false);
      assert.equal(await bridge.authorizedDelegatees(other.target,delegatee.address),false);
      assert.equal(await bridge.consumedNullifiers(p.nullifier),false);
      assert.equal(await registry.consumedCheckpoints(await registry.checkpointDigest(p.checkpoint)),false);
    };
    async function reject(call,label){await assert.rejects(async()=>{const tx=await call();await tx.wait();},label);await check();}
    await reject(()=>account.authorizeDelegateeWithProof(p.checkpoint,awaitedSignature(),proof,delegatee.address,true),"forged signature");
    function awaitedSignature(){return "0x"+("11".repeat(65));}
    await reject(()=>other.authorizeDelegateeWithProof(p.checkpoint,p.signature,proof,delegatee.address,true),"cross-account proof reuse");
    await reject(()=>account.authorizeDelegateeWithProof(p.checkpoint,p.signature,proof,outsider.address,true),"tampered delegatee");
    await reject(()=>account.authorizeDelegateeWithProof(p.checkpoint,p.signature,proof,delegatee.address,false),"tampered authorization decision");
    const deadline=BigInt(p.v3Signals[12]);
    await ethers.provider.send("evm_setNextBlockTimestamp",[Number(deadline+1n)]);
    await ethers.provider.send("evm_mine",[]);
    await reject(()=>account.authorizeDelegateeWithProof(p.checkpoint,p.signature,proof,delegatee.address,true),"expired authorization");
  });
});
