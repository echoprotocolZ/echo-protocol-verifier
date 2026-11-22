const { ethers, network } = require("hardhat");
const assert = require("node:assert/strict");

describe("ECHO V4 real bridge + real V3 registry atomic rollback (stubbed proof, local)", function () {
  it("reverts checkpoint, nullifier, nonce on failed target and consumes exactly once on success", async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    const [owner, validator] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const policy = await (await ethers.getContractFactory("EchoV4TestPolicyStub")).deploy();
    const gateway = await (await ethers.getContractFactory("EchoV4TestGatewayStub")).deploy(await policy.getAddress());
    const verifier = await (await ethers.getContractFactory("EchoV4AlwaysTrueDualProofStub")).deploy(await gateway.getAddress());
    const bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(await verifier.getAddress(), await registry.getAddress());
    const account = await (await ethers.getContractFactory("EchoV4RegistryConfiguredTestAccount")).deploy(owner.address, await bridge.getAddress());
    const target = await (await ethers.getContractFactory("EchoV4TestToggleTarget")).deploy();
    const zone = ethers.keccak256(ethers.toUtf8Bytes("test-zone"));
    await (await account.configureTestRegistry(await registry.getAddress(), await bridge.getAddress(), validator.address, zone)).wait();
    const block = await ethers.provider.getBlock("latest");
    const cp = {account:await account.getAddress(),delegatee:await account.getAddress(),zoneHash:zone,
      checkpointCommitment:ethers.keccak256(ethers.toUtf8Bytes("checkpoint")),
      authorizationCommitment:ethers.keccak256(ethers.toUtf8Bytes("authorization")),
      timestamp:block.timestamp,nonce:0};
    const domain = {name:"EchoAttestationRegistryV3",version:"1",chainId:(await ethers.provider.getNetwork()).chainId,verifyingContract:await registry.getAddress()};
    const types = {SignedCheckpoint:[{name:"account",type:"address"},{name:"delegatee",type:"address"},{name:"zoneHash",type:"bytes32"},{name:"checkpointCommitment",type:"bytes32"},{name:"authorizationCommitment",type:"bytes32"},{name:"timestamp",type:"uint64"},{name:"nonce",type:"uint256"}]};
    const signature = await validator.signTypedData(domain,types,cp);
    const data = target.interface.encodeFunctionData("execute");
    const hash = BigInt(ethers.keccak256(data));
    const signals = Array(20).fill(0n);
    signals[1]=BigInt(cp.authorizationCommitment);signals[2]=123456789n;
    signals[3]=BigInt(cp.account);signals[4]=BigInt(cp.delegatee);
    signals[5]=BigInt(validator.address);signals[6]=BigInt(await target.getAddress());
    signals[8]=hash & ((1n<<128n)-1n);signals[9]=hash>>128n;
    signals[10]=domain.chainId;signals[11]=0n;signals[12]=BigInt(block.timestamp+3600);
    signals[16]=BigInt(block.timestamp-10);signals[17]=BigInt(block.timestamp+3600);
    signals[18]=BigInt(cp.checkpointCommitment);signals[19]=BigInt(cp.timestamp);
    const a=[0,0],b=[[0,0],[0,0]],v4=[0,0,0,0,BigInt(cp.checkpointCommitment)];
    const run=async()=>account.executeAuthorized(cp,signature,a,b,a,signals,a,b,a,v4,await target.getAddress(),0,data);
    const digest=await registry.checkpointDigest(cp);
    await assert.rejects(async()=>{const tx=await run();await tx.wait();});
    assert.equal(await account.nonce(),0n);
    assert.equal(await registry.consumedCheckpoints(digest),false);
    assert.equal(await registry.consumedCheckpointNonces(cp.account,cp.delegatee,0),false);
    assert.equal(await bridge.consumedNullifiers(signals[2]),false);
    assert.equal(await target.calls(),0n);
    await (await target.setShouldRevert(false)).wait();
    await (await run()).wait();
    assert.equal(await account.nonce(),1n);
    assert.equal(await registry.consumedCheckpoints(digest),true);
    assert.equal(await registry.consumedCheckpointNonces(cp.account,cp.delegatee,0),true);
    assert.equal(await bridge.consumedNullifiers(signals[2]),true);
    assert.equal(await target.calls(),1n);
    await assert.rejects(async()=>{const tx=await run();await tx.wait();});
    assert.equal(await target.calls(),1n);
  });
});
