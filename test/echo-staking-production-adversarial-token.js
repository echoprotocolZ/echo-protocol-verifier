const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {ethers}=require("hardhat");

describe("EchoStaking verified bytecode — adversarial ERC20",function(){
  const U=n=>ethers.parseEther(String(n));
  let owner,validator,token,staking;
  beforeEach(async function(){
    [owner,validator]=await ethers.getSigners();
    token=await (await ethers.getContractFactory("EchoAdversarialTokenMock")).deploy();
    await token.waitForDeployment();
    const file=path.resolve(__dirname,"../production-evidence/compiler-output.json");
    if(!fs.existsSync(file))throw Error("Missing verified production compiler output");
    const raw=fs.readFileSync(file,"utf8");
    const output=JSON.parse(raw.slice(raw.indexOf("{")));
    const compiled=output.contracts?.["contracts/EchoStaking.sol"]?.EchoStaking;
    assert.ok(compiled?.evm?.bytecode?.object,"Missing verified staking bytecode");
    staking=await new ethers.ContractFactory(compiled.abi,"0x"+compiled.evm.bytecode.object,owner).deploy(token.target);
    await staking.waitForDeployment();
    await (await token.mint(validator.address,U(2000))).wait();
    await (await token.connect(validator).approve(staking.target,U(2000))).wait();
  });

  it("reverted transferFrom leaves stake, token balance and allowance unchanged",async function(){
    await (await token.setMode(1)).wait();
    const balance=await token.balanceOf(validator.address);
    const allowance=await token.allowance(validator.address,staking.target);
    await assert.rejects(async()=>{await (await staking.connect(validator).stake(U(1000))).wait();});
    assert.equal(await staking.totalStaked(),0n);
    assert.equal(await token.balanceOf(validator.address),balance);
    assert.equal(await token.allowance(validator.address,staking.target),allowance);
  });

  it("fee-on-transfer stake fails and rolls back all accounting",async function(){
    await (await token.setMode(3)).wait();
    await assert.rejects(async()=>{await (await staking.connect(validator).stake(U(1000))).wait();});
    assert.equal(await staking.totalStaked(),0n);
    assert.equal(await staking.getValidatorStake(validator.address),0n);
    assert.equal(await token.balanceOf(staking.target),0n);
  });

  it("reentrant stake callback cannot create a second stake",async function(){
    // Callback originates from the token contract; that address has no allowance.
    // We assert the attempted reentrant stake call fails and original stake succeeds.
    const data=staking.interface.encodeFunctionData("stake",[U(1000)]);
    await (await token.setCallback(staking.target,data)).wait();
    await (await token.setMode(4)).wait();
    await (await staking.connect(validator).stake(U(1000))).wait();
    assert.equal(await token.callbackSucceeded(),false);
    assert.equal(await staking.totalStaked(),U(1000));
    assert.equal(await staking.getValidatorStake(validator.address),U(1000));
    assert.equal(await token.balanceOf(staking.target),U(1000));
  });

  it("failed reward funding does not increase reward pool",async function(){
    await (await token.approve(staking.target,U(100))).wait();
    await (await token.setMode(1)).wait();
    await assert.rejects(async()=>{await (await staking.fundRewards(U(100))).wait();});
    assert.equal(await staking.rewardPool(),0n);
    assert.equal(await token.balanceOf(staking.target),0n);
  });

  it("failed reward payout restores reward pool and contract backing",async function(){
    await (await staking.connect(validator).stake(U(1000))).wait();
    await (await token.approve(staking.target,U(100))).wait();
    await (await staking.fundRewards(U(100))).wait();
    await (await token.setMode(2)).wait();
    await assert.rejects(async()=>{await (await staking.distributeReward(validator.address,U(50))).wait();});
    assert.equal(await staking.rewardPool(),U(100));
    assert.equal(await staking.totalStaked(),U(1000));
    assert.equal(await token.balanceOf(staking.target),U(1100));
  });

  it("failed withdrawal transfer rolls back stake and withdrawal request",async function(){
    await (await staking.connect(validator).stake(U(1000))).wait();
    await ethers.provider.send("evm_increaseTime",[90*24*3600+1]);
    await ethers.provider.send("evm_mine",[]);
    await (await staking.connect(validator).requestUnstake()).wait();
    await ethers.provider.send("evm_increaseTime",[24*3600+1]);
    await ethers.provider.send("evm_mine",[]);
    const before=await staking.validators(validator.address);
    await (await token.setMode(2)).wait();
    await assert.rejects(async()=>{await (await staking.connect(validator).withdraw(U(1000))).wait();});
    assert.equal(await staking.totalStaked(),U(1000));
    assert.equal(await staking.getValidatorStake(validator.address),U(1000));
    assert.equal((await staking.validators(validator.address)).unstakeRequestedAt,before.unstakeRequestedAt);
    assert.equal(await token.balanceOf(staking.target),U(1000));
  });
});
