"use strict";
const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

describe("Echo V4 typed bootstrap intent isolation", function () {
  let owner, account, registry, bridge;
  beforeEach(async function () {
    assert.equal(network.name, "hardhat", "LOCAL ONLY");
    [owner] = await ethers.getSigners();
    registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    await registry.waitForDeployment();
    bridge = await (await ethers.getContractFactory("EchoLocalExecutionBridgeMock")).deploy(
      registry.target, registry.target
    );
    await bridge.waitForDeployment();
    account = await (await ethers.getContractFactory("EchoSmartAccountV4")).deploy(
      owner.address, ethers.ZeroAddress, bridge.target
    );
    await account.waitForDeployment();
  });
  it("separates validator, hardware, trust and revocation intents", async function () {
    const deadline = 2000000000n;
    const validator = await account.signerConfigurationIntent(registry.target, owner.address, false, true, deadline);
    const hardware = await account.signerConfigurationIntent(registry.target, owner.address, true, true, deadline);
    const revoke = await account.signerConfigurationIntent(registry.target, owner.address, false, false, deadline);
    assert.notEqual(validator, hardware);
    assert.notEqual(validator, revoke);
    const fields = ethers.AbiCoder.defaultAbiCoder().decode(
      ["bytes32","address","address","address","bool","uint256","uint256","uint256"], validator
    );
    assert.equal(fields[0], ethers.id("ECHO_V4_ADMIN_VALIDATOR_SIGNER_CONFIGURATION_V1"));
    assert.equal(fields[1], account.target);
    assert.equal(fields[2], registry.target);
    assert.equal(fields[3], owner.address);
    assert.equal(fields[4], true);
    assert.equal(fields[5], (await ethers.provider.getNetwork()).chainId);
    assert.equal(fields[6], 0n);
    assert.equal(fields[7], deadline);
    assert.equal(await registry.trustedValidatorSigners(account.target, owner.address), false);
    assert.equal(await registry.trustedHardwareSigners(account.target, owner.address), false);
  });
  it("binds exact policy hash, delegatee and deadline without changing state", async function () {
    const policyA = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32","uint64","uint8","bool","bool"],
      [ethers.id("zone-a"), 300, 0, false, true]
    ));
    const policyB = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32","uint64","uint8","bool","bool"],
      [ethers.id("zone-b"), 300, 0, false, true]
    ));
    const a = await account.attestationPolicyIntent(registry.target, owner.address, policyA, 2000000000);
    assert.notEqual(a, await account.attestationPolicyIntent(registry.target, owner.address, policyB, 2000000000));
    assert.notEqual(a, await account.attestationPolicyIntent(registry.target, owner.address, policyA, 2000000001));
    const fields = ethers.AbiCoder.defaultAbiCoder().decode(
      ["bytes32","address","address","address","bytes32","uint256","uint256","uint256"], a
    );
    assert.equal(fields[0], ethers.id("ECHO_V4_ADMIN_ATTESTATION_POLICY_CONFIGURATION_V1"));
    assert.equal(fields[4], policyA);
    assert.equal((await registry.attestationPolicies(account.target, owner.address)).enabled, false);
    assert.equal(await account.nonce(), 0n);
  });
  it("rejects zero addresses and deadlines; administration remains locked", async function () {
    await assert.rejects(account.signerConfigurationIntent(ethers.ZeroAddress, owner.address, false, true, 1));
    await assert.rejects(account.signerConfigurationIntent(registry.target, ethers.ZeroAddress, false, true, 1));
    await assert.rejects(account.signerConfigurationIntent(registry.target, owner.address, false, true, 0));
    await assert.rejects(account.attestationPolicyIntent(ethers.ZeroAddress, owner.address, ethers.ZeroHash, 1));
    await assert.rejects(account.attestationPolicyIntent(registry.target, ethers.ZeroAddress, ethers.ZeroHash, 1));
    await assert.rejects(account.attestationPolicyIntent(registry.target, owner.address, ethers.ZeroHash, 0));
    const data = registry.interface.encodeFunctionData("setValidatorSigner", [owner.address, true]);
    await assert.rejects(account.executeAdministration(registry.target, data));
    assert.equal(await account.nonce(), 0n);
  });
});
