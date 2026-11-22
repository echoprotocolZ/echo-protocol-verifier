const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const assert = require("node:assert/strict");

describe("EchoStakingSourceFixture — tripartite forensic authority", function () {
  const STAKE = ethers.parseEther("1000");
  const PENALTY = ethers.parseEther("100");
  let owner, oracle, registrySigner, validator, outsider, token, staking, registry;

  async function revert(promise, message) {
    await assert.rejects(async () => { const tx = await promise; await tx.wait(); }, (err) => {
      assert.ok(String(err).includes(message), String(err));
      return true;
    });
  }
  async function incident(label) { return ethers.id(label); }
  async function stakeValidator() {
    await (await token.connect(validator).approve(await staking.getAddress(), STAKE)).wait();
    await (await staking.connect(validator).stake(STAKE)).wait();
  }
  async function slashAndCheck(actor, id) {
    await (await staking.connect(actor).slash(validator.address, id)).wait();
    expect(await staking.processedIncidents(id)).to.equal(true);
    expect(await staking.getValidatorStake(validator.address)).to.equal(STAKE - PENALTY);
    expect(await staking.totalStaked()).to.equal(STAKE - PENALTY);
    expect(await staking.rewardPool()).to.equal(PENALTY);
    expect(await staking.isNodeQuarantined(validator.address)).to.equal(true);
    expect(await staking.isValidatorActive(validator.address)).to.equal(false);
  }
  beforeEach(async function () {
    [owner, oracle, registrySigner, validator, outsider] = await ethers.getSigners();
    token = await (await ethers.getContractFactory("EchoTokenTestMock")).deploy();
    await token.waitForDeployment();
    staking = await (await ethers.getContractFactory("EchoStakingSourceFixture")).deploy(await token.getAddress());
    await staking.waitForDeployment();
    registry = await (await ethers.getContractFactory("EchoStakingAuthorityForwarderFixture")).deploy(await staking.getAddress());
    await registry.waitForDeployment();
    // The registry must be a contract; this fixture forwards as the contract address.
    await (await staking.connect(owner).setForensicOracle(oracle.address)).wait();
    await (await staking.connect(owner).setRegistryAddress(await registry.getAddress())).wait();
    await (await token.mint(validator.address, STAKE)).wait();
    await stakeValidator();
  });

  it("rejects unauthorized slashing and preserves balances", async function () {
    const id = await incident("unauthorized");
    await revert(staking.connect(outsider).slash(validator.address, id), "Not authorized");
    await revert(staking.connect(outsider).slashNode(validator.address, 501, id), "Not authorized");
    expect(await staking.processedIncidents(id)).to.equal(false);
    expect(await staking.getValidatorStake(validator.address)).to.equal(STAKE);
  });

  it("permits owner slashing with accounting and quarantine", async function () {
    await slashAndCheck(owner, await incident("owner"));
  });
  it("permits designated forensic oracle slashing", async function () {
    await slashAndCheck(oracle, await incident("oracle"));
  });
  it("permits designated registry contract slashing", async function () {
    const id = await incident("registry");
    await (await registry.connect(registrySigner).slash(validator.address, id)).wait();
    expect(await staking.processedIncidents(id)).to.equal(true);
    expect(await staking.getValidatorStake(validator.address)).to.equal(STAKE - PENALTY);
    expect(await staking.isNodeQuarantined(validator.address)).to.equal(true);
  });
  it("rejects zero incident IDs and insufficient drift", async function () {
    await revert(staking.connect(owner).slash(validator.address, ethers.ZeroHash), "Invalid incident");
    await revert(staking.connect(oracle).slashNode(validator.address, 500, await incident("low-drift")), "Drift within threshold");
    expect(await staking.totalStaked()).to.equal(STAKE);
  });
  it("rejects replayed incident IDs even after reactivation and cooldown", async function () {
    const id = await incident("replay");
    await (await staking.connect(owner).slash(validator.address, id)).wait();
    await (await staking.connect(owner).reactivateValidator(validator.address)).wait();
    await network.provider.send("evm_increaseTime", [86401]);
    await network.provider.send("evm_mine");
    await revert(staking.connect(oracle).slash(validator.address, id), "Incident already processed");
  });
  it("enforces slashing cooldown after owner reactivates a validator", async function () {
    await (await staking.connect(owner).slash(validator.address, await incident("first"))).wait();
    await (await staking.connect(owner).reactivateValidator(validator.address)).wait();
    await revert(staking.connect(oracle).slash(validator.address, await incident("second")), "Slashing cooldown active");
  });
  it("blocks quarantined validator withdrawals after unbonding", async function () {
    await network.provider.send("evm_increaseTime", [90 * 86400 + 1]);
    await network.provider.send("evm_mine");
    await (await staking.connect(validator).requestUnstake()).wait();
    await network.provider.send("evm_increaseTime", [86401]);
    await network.provider.send("evm_mine");
    await (await staking.connect(owner).slash(validator.address, await incident("pending-withdraw"))).wait();
    await revert(staking.connect(validator).withdraw(STAKE - PENALTY), "Validator quarantined");
  });
  it("permits matured unbonded withdrawals while paused", async function () {
    await network.provider.send("evm_increaseTime", [90 * 86400 + 1]);
    await network.provider.send("evm_mine");
    await (await staking.connect(validator).requestUnstake()).wait();
    await network.provider.send("evm_increaseTime", [86401]);
    await network.provider.send("evm_mine");
    await (await staking.connect(owner).pause()).wait();
    await (await staking.connect(validator).withdraw(STAKE)).wait();
    expect(await staking.totalStaked()).to.equal(0n);
  });
  it("rejects unauthorized registry/oracle replacement", async function () {
    await revert(staking.connect(outsider).setForensicOracle(outsider.address), "OwnableUnauthorizedAccount");
    await revert(staking.connect(outsider).setRegistryAddress(await registry.getAddress()), "OwnableUnauthorizedAccount");
  });
});
