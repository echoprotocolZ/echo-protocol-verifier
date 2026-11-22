"use strict";
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

// REAL EchoAuthorizationBridgeV4 and REAL V3 registry; intentionally invalid
// Groth16 inputs. This is a negative-control integration test, NOT a proof
// of successful real Groth16 execution.
describe("Echo V4 signed bootstrap + real bridge fail-closed (local)", function () {
  it("registers the real bridge, then rejects proof-free execution atomically", async function () {
    assert.equal(network.name,"hardhat","LOCAL ONLY");
    const [owner] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const verifier = await (await ethers.getContractFactory("EchoV4BootstrapSignatureVerifier")).deploy(owner.address);
    const policy = await (await ethers.getContractFactory("EchoLocalTargetMock")).deploy();
    const gateway = await (await ethers.getContractFactory("EchoLocalGatewayMock")).deploy(policy.target);
    const dual = await (await ethers.getContractFactory("EchoLocalDualMock")).deploy(gateway.target);
    const bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(dual.target,registry.target);
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4Bootstrap")).deploy(
      owner.address,ethers.ZeroAddress,bridge.target,registry.target,verifier.target
    );
    const target = await (await ethers.getContractFactory("EchoLocalTargetMock")).deploy();
    for(const c of [registry,verifier,policy,gateway,dual,bridge,account,target]) await c.waitForDeployment();

    const deadline=BigInt((await ethers.provider.getBlock("latest")).timestamp+3600);
    const tag=ethers.keccak256(ethers.toUtf8Bytes("ECHO_V4_ADMIN_BRIDGE_REGISTRATION_V1"));
    const encoded=ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32","address","address","address","bool","uint256","uint256","uint256"],
      [tag,account.target,registry.target,bridge.target,true,(await ethers.provider.getNetwork()).chainId,0n,deadline]
    );
    const digest=await verifier.registrationDigest(ethers.keccak256(encoded));
    const sig=await owner.signMessage(ethers.getBytes(digest));
    await (await account.registerImmutableBridge(true,deadline,sig)).wait();
    assert.equal(await registry.authorizedCheckpointBridges(account.target,bridge.target),true);
    assert.equal(await account.registrationNonce(),1n);

    const checkpoint={
      account:account.target,delegatee:account.target,zoneHash:ethers.ZeroHash,
      checkpointCommitment:ethers.ZeroHash,authorizationCommitment:ethers.ZeroHash,
      timestamp:0,nonce:0
    };
    const data=target.interface.encodeFunctionData("increment");
    await assert.rejects(async()=>(
      await account.executeAuthorized(
        checkpoint,"0x",[0,0],[[0,0],[0,0]],[0,0],Array(20).fill(0),
        [0,0],[[0,0],[0,0]],[0,0],Array(5).fill(0),target.target,0,data
      )
    ).wait());
    assert.equal(await target.count(),0n);
    assert.equal(await account.nonce(),0n);
    assert.equal(await account.registrationNonce(),1n);
    assert.equal(await bridge.consumedNullifiers(0),false);
    assert.equal(await registry.authorizedCheckpointBridges(account.target,bridge.target),true);
  });
});
