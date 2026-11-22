"use strict";
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

// A single Hardhat test process keeps the candidate deployed while inputs are
// derived. It does NOT generate Groth16 proofs or authorize a delegatee.
describe("Echo V4 delegation: same-session candidate proof inputs", function () {
  it("deploys candidate and derives exact intent-bound public signals", async function () {
    const [owner, delegatee] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const v3Verifier = await (await ethers.getContractFactory("EchoAuthorizationVerifierV3")).deploy();
    const v3Bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV3")).deploy(v3Verifier.target, registry.target);
    const geoVerifier = await (await ethers.getContractFactory("EchoGeographicBoundVerifierV4")).deploy();
    const geoPolicy = await (await ethers.getContractFactory("EchoGeographicPolicyRegistryV4")).deploy();
    const gateway = await (await ethers.getContractFactory("EchoGeographicProofGatewayV4")).deploy(geoVerifier.target, geoPolicy.target);
    const dual = await (await ethers.getContractFactory("EchoDualProofVerifierV4")).deploy(v3Bridge.target, gateway.target);
    const bridge = await (await ethers.getContractFactory("EchoAuthorizationBridgeV4")).deploy(dual.target, registry.target);
    const account = await (await ethers.getContractFactory("EchoSmartAccountV4DelegationCandidate")).deploy(
      owner.address, ethers.ZeroAddress, bridge.target, owner.address,
      { minLat: 0, maxLat: 1800000000, minLon: 0, maxLon: 3600000000 }, 3600
    );
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const nonce = await account.nonce();
    const intent = await account.delegationIntent(delegatee.address, true);
    const hash = BigInt(ethers.keccak256(intent));
    const mask = (1n << 128n) - 1n;
    const fields = ethers.AbiCoder.defaultAbiCoder().decode(
      ["bytes32", "uint256", "address", "address", "bool", "uint256"], intent);
    assert.equal(fields[0], await account.DELEGATION_DOMAIN());
    assert.equal(fields[1], chainId);
    assert.equal(fields[2].toLowerCase(), account.target.toLowerCase());
    assert.equal(fields[3].toLowerCase(), delegatee.address.toLowerCase());
    assert.equal(fields[4], true);
    assert.equal(fields[5], nonce);
    assert.equal(await bridge.authorizedDelegatees(account.target, delegatee.address), false);

    const signals = {
      account: BigInt(account.target).toString(),
      checkpointDelegatee: BigInt(account.target).toString(),
      target: BigInt(account.target).toString(),
      value: "0",
      callDataHashLow128: (hash & mask).toString(),
      callDataHashHigh128: (hash >> 128n).toString(),
      chainId: chainId.toString(),
      nonce: nonce.toString()
    };
    assert.equal(BigInt(signals.callDataHashLow128) + (BigInt(signals.callDataHashHigh128) << 128n), hash);
    console.log("LOCAL CANDIDATE:", account.target);
    console.log("LOCAL DELEGATEE:", delegatee.address);
    console.log("LOCAL BRIDGE:", bridge.target);
    console.log("INTENT:", intent);
    console.log("V3 PUBLIC TRANSACTION BINDINGS:", JSON.stringify(signals));
    console.log("PROOF GENERATION: NOT PERFORMED");
    console.log("AUTHORIZATION: NOT PERFORMED");
    console.log("LOCAL HARDHAT STATE: EPHEMERAL; addresses must not be used on Amoy");
  });
});
