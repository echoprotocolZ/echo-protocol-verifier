"use strict";
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

describe("Echo V4 local execution and bridge-registration boundary", function () {
  let owner, outsider, account, bridge, target, registry;
  const zero2=[0,0], zeroB=[[0,0],[0,0]], zero20=Array(20).fill(0), zero5=Array(5).fill(0);
  async function deploy(name,...args) {
    const c=await (await ethers.getContractFactory(name)).deploy(...args);
    await c.waitForDeployment(); return c;
  }
  function args(targetAddress, data) {
    const checkpoint={
      account:account.target, delegatee:owner.address,
      zoneHash:ethers.ZeroHash,checkpointCommitment:ethers.ZeroHash,
      authorizationCommitment:ethers.ZeroHash,timestamp:0,nonce:0
    };
    return [checkpoint,"0x",zero2,zeroB,zero2,zero20,zero2,zeroB,zero2,zero5,targetAddress,0,data];
  }
  beforeEach(async function () {
    assert.equal(network.name,"hardhat","LOCAL ONLY");
    [owner,outsider]=await ethers.getSigners();
    registry=await deploy("EchoAttestationRegistryV3");
    const policy=await deploy("EchoGeographicPolicyRegistryV4");
    const gateway=await deploy("EchoLocalGatewayMock",policy.target);
    const dual=await deploy("EchoLocalDualMock",gateway.target);
    bridge=await deploy("EchoLocalExecutionBridgeMock",registry.target,dual.target);
    account=await deploy("EchoSmartAccountV4",owner.address,ethers.ZeroAddress,bridge.target);
    target=await deploy("EchoLocalTargetMock");
  });
  it("executes one permitted target call and increments account nonce with a MOCK bridge",async function(){
    await (await bridge.setApprove(true)).wait();
    const data=target.interface.encodeFunctionData("increment");
    await (await account.executeAuthorized(...args(target.target,data))).wait();
    assert.equal(await target.count(),1n);
    assert.equal(await account.nonce(),1n);
    assert.equal(await bridge.calls(),1n);
    assert.equal(await bridge.lastNonce(),0n);
  });
  it("rejects bridge refusal without consuming nonce or changing target",async function(){
    const data=target.interface.encodeFunctionData("increment");
    await assert.rejects(async()=>{await (await account.executeAuthorized(...args(target.target,data))).wait()});
    assert.equal(await account.nonce(),0n);
    assert.equal(await target.count(),0n);
    assert.equal(await bridge.calls(),0n);
  });
  it("rolls back bridge mock consumption and account nonce on target revert",async function(){
    await (await bridge.setApprove(true)).wait();
    const data=target.interface.encodeFunctionData("fail");
    await assert.rejects(async()=>{await (await account.executeAuthorized(...args(target.target,data))).wait()});
    assert.equal(await account.nonce(),0n);
    assert.equal(await bridge.calls(),0n);
  });
  it("rejects an outsider before bridge authorization",async function(){
    await (await bridge.setApprove(true)).wait();
    const data=target.interface.encodeFunctionData("increment");
    await assert.rejects(async()=>{await (await account.connect(outsider).executeAuthorized(...args(target.target,data))).wait()});
    assert.equal(await bridge.calls(),0n);
    assert.equal(await account.nonce(),0n);
  });
  it("documents real registry registration boundary: outsider cannot register for account",async function(){
    await (await registry.connect(outsider).setCheckpointBridge(bridge.target,true)).wait();
    assert.equal(await registry.authorizedCheckpointBridges(account.target,bridge.target),false);
    assert.equal(await registry.authorizedCheckpointBridges(outsider.address,bridge.target),true);
    await assert.rejects(async()=>{await (await account.executeAdministration(registry.target,registry.interface.encodeFunctionData("setCheckpointBridge",[bridge.target,true]))).wait()});
    assert.equal(await registry.authorizedCheckpointBridges(account.target,bridge.target),false);
  });
});
