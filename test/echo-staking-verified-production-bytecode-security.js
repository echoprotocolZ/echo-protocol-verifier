const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("hardhat");

/**
 * Deploys EXACT verified Polygon EchoStaking creation bytecode, compiled by
 * solc 0.8.24 from production-evidence. Does not use local source fixture.
 * Read-only local Hardhat network; no mainnet transactions.
 */
describe("EchoStaking — verified production bytecode security regressions", function () {
  const artifactPath = path.resolve(__dirname, "../production-evidence/compiler-output.json");
  const U = (n) => ethers.parseEther(String(n));
  let owner, validator, outsider, token, staking;

  before(function () {
    if (!fs.existsSync(artifactPath)) {
      throw Error("Missing verified compiler output. Run prepare-verified-staking-compiler-input.js and solc@0.8.24 compilation first.");
    }
  });

  beforeEach(async function () {
    [owner, validator, outsider] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory("EchoTokenTestMock");
    token = await tokenFactory.deploy();
    await token.waitForDeployment();
    const raw = fs.readFileSync(artifactPath, "utf8");
    const output = JSON.parse(raw.slice(raw.indexOf("{")));
    const errors = (output.errors || []).filter(x => x.severity === "error");
    assert.equal(errors.length, 0, "Production source compilation has errors");
    const contract = output.contracts?.["contracts/EchoStaking.sol"]?.EchoStaking;
    assert.ok(contract?.evm?.bytecode?.object, "Verified production creation bytecode missing");
    const factory = new ethers.ContractFactory(contract.abi, "0x" + contract.evm.bytecode.object, owner);
    staking = await factory.deploy(token.target);
    await staking.waitForDeployment();
    await (await token.mint(validator.address, U(3000))).wait();
    await (await token.connect(validator).approve(staking.target, U(3000))).wait();
  });

  it("enforces the 1000 ECHO minimum and preserves balances on rejected stake", async function () {
    const balance = await token.balanceOf(validator.address);
    await assert.rejects(async () => { await (await staking.connect(validator).stake(U(999))).wait(); });
    assert.equal(await staking.totalStaked(), 0n);
    assert.equal(await token.balanceOf(validator.address), balance);
    await (await staking.connect(validator).stake(U(1000))).wait();
    assert.equal(await staking.getValidatorStake(validator.address), U(1000));
    assert.equal(await staking.totalStaked(), U(1000));
  });

  it("prevents unauthorized reward distribution and slashing", async function () {
    await (await staking.connect(validator).stake(U(1000))).wait();
    await (await token.approve(staking.target, U(100))).wait();
    await (await staking.fundRewards(U(100))).wait();
    await assert.rejects(async () => { await (await staking.connect(outsider).distributeReward(validator.address, U(1))).wait(); });
    await assert.rejects(async () => { await (await staking.connect(outsider).slash(validator.address, ethers.id("incident-1"))).wait(); });
    assert.equal(await staking.rewardPool(), U(100));
    assert.equal(await staking.totalStaked(), U(1000));
  });

  it("prevents premature withdrawal and permits withdrawal only after lock and unbonding", async function () {
    await (await staking.connect(validator).stake(U(1000))).wait();
    await assert.rejects(async () => { await (await staking.connect(validator).requestUnstake()).wait(); });
    await ethers.provider.send("evm_increaseTime", [90 * 24 * 3600 + 1]);
    await ethers.provider.send("evm_mine", []);
    await (await staking.connect(validator).requestUnstake()).wait();
    await assert.rejects(async () => { await (await staking.connect(validator).withdraw(U(1000))).wait(); });
    await ethers.provider.send("evm_increaseTime", [24 * 3600 + 1]);
    await ethers.provider.send("evm_mine", []);
    await (await staking.connect(validator).withdraw(U(1000))).wait();
    assert.equal(await staking.totalStaked(), 0n);
    assert.equal(await token.balanceOf(validator.address), U(3000));
  });

  it("does not allow owner to rescue reserved stake or reward backing", async function () {
    await (await staking.connect(validator).stake(U(1000))).wait();
    await (await token.approve(staking.target, U(100))).wait();
    await (await staking.fundRewards(U(100))).wait();
    await assert.rejects(async () => { await (await staking.rescueExcessTokens(token.target, owner.address, 1n)).wait(); });
    assert.equal(await token.balanceOf(staking.target), U(1100));
    assert.equal(await staking.availableExcessEcho(), 0n);
  });

  it("prevents outsider pause and prevents staking while paused", async function () {
    await assert.rejects(async () => { await (await staking.connect(outsider).pause()).wait(); });
    await (await staking.pause()).wait();
    await assert.rejects(async () => { await (await staking.connect(validator).stake(U(1000))).wait(); });
    assert.equal(await staking.totalStaked(), 0n);
    await (await staking.unpause()).wait();
    await (await staking.connect(validator).stake(U(1000))).wait();
    assert.equal(await staking.totalStaked(), U(1000));
  });
  it("slashes exactly 100 ECHO, quarantines validator, and rejects incident replay", async function () {
    await (await staking.connect(validator).stake(U(1000))).wait();
    const incident = ethers.id("production-regression-incident");
    await (await staking.slash(validator.address, incident)).wait();
    assert.equal(await staking.getValidatorStake(validator.address), U(900));
    assert.equal(await staking.totalStaked(), U(900));
    assert.equal(await staking.rewardPool(), U(100));
    assert.equal(await staking.isNodeQuarantined(validator.address), true);
    assert.equal(await staking.isValidatorActive(validator.address), false);
    assert.equal(await staking.processedIncidents(incident), true);
    await assert.rejects(async () => { await (await staking.slash(validator.address, incident)).wait(); });
    await assert.rejects(async () => { await (await staking.connect(validator).stake(U(100))).wait(); });
    assert.equal(await staking.totalStaked(), U(900));
  });

  it("requires owner reactivation and collateral minimum for active status", async function () {
    await (await staking.connect(validator).stake(U(1000))).wait();
    await (await staking.slash(validator.address, ethers.id("reactivation-incident"))).wait();
    await assert.rejects(async () => { await (await staking.connect(outsider).reactivateValidator(validator.address)).wait(); });
    await (await staking.reactivateValidator(validator.address)).wait();
    assert.equal(await staking.isNodeQuarantined(validator.address), false);
    assert.equal(await staking.isValidatorActive(validator.address), false);
    await (await staking.connect(validator).stake(U(100))).wait();
    assert.equal(await staking.isValidatorActive(validator.address), true);
    assert.equal(await staking.totalStaked(), U(1000));
  });

  it("accounts for reward funding and distribution without consuming staked principal", async function () {
    await (await staking.connect(validator).stake(U(1000))).wait();
    await (await token.approve(staking.target, U(250))).wait();
    await (await staking.fundRewards(U(250))).wait();
    assert.equal(await staking.rewardPool(), U(250));
    await (await staking.distributeReward(validator.address, U(60))).wait();
    assert.equal(await staking.rewardPool(), U(190));
    assert.equal(await staking.totalStaked(), U(1000));
    assert.equal(await token.balanceOf(staking.target), U(1190));
    await assert.rejects(async () => { await (await staking.distributeReward(validator.address, U(191))).wait(); });
    assert.equal(await staking.rewardPool(), U(190));
  });

  it("enforces drift threshold and prevents replay of processed incidents", async function () {
    await (await staking.connect(validator).stake(U(1000))).wait();
    const incident=ethers.id("drift-boundary");
    await assert.rejects(async () => { await (await staking.slashNode(validator.address, 500, incident)).wait(); });
    assert.equal(await staking.processedIncidents(incident), false);
    await (await staking.slashNode(validator.address, 501, incident)).wait();
    assert.equal(await staking.processedIncidents(incident), true);
    await assert.rejects(async () => { await (await staking.slashNode(validator.address, 501, incident)).wait(); });
  });

  it("allows rescue of genuine excess ECHO while preserving reserved accounting", async function () {
    await (await staking.connect(validator).stake(U(1000))).wait();
    await (await token.transfer(staking.target, U(25))).wait();
    assert.equal(await staking.availableExcessEcho(), U(25));
    await assert.rejects(async () => { await (await staking.connect(outsider).rescueExcessTokens(token.target, outsider.address, U(1))).wait(); });
    await (await staking.rescueExcessTokens(token.target, owner.address, U(25))).wait();
    assert.equal(await staking.availableExcessEcho(), 0n);
    assert.equal(await staking.totalStaked(), U(1000));
    assert.equal(await token.balanceOf(staking.target), U(1000));
  });

});
