const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {ethers}=require("hardhat");

// Local deterministic accounting invariants against EXACT verified production creation bytecode.
// All assets are mock tokens on the local Hardhat chain. No mainnet transactions.
describe("EchoStaking verified production bytecode — accounting invariants",function(){
 const U=n=>ethers.parseEther(String(n));
 let owner,alice,bob,outsider,token,staking;
 async function invariant(){
   const a=await staking.getValidatorStake(alice.address);
   const b=await staking.getValidatorStake(bob.address);
   const total=await staking.totalStaked();
   const rewards=await staking.rewardPool();
   const backing=await token.balanceOf(staking.target);
   assert.equal(total,a+b,"totalStaked must equal tracked validator principal");
   assert.ok(backing>=total+rewards,"contract balance must back principal and rewards");
   assert.equal(await staking.availableExcessEcho(),backing-total-rewards,"excess must equal unreserved balance");
 }
 beforeEach(async function(){
   [owner,alice,bob,outsider]=await ethers.getSigners();
   token=await(await ethers.getContractFactory("EchoTokenTestMock")).deploy();
   await token.waitForDeployment();
   const file=path.resolve(__dirname,"../production-evidence/compiler-output.json");
   if(!fs.existsSync(file))throw Error("Missing production-evidence/compiler-output.json");
   const raw=fs.readFileSync(file,"utf8");
   const output=JSON.parse(raw.slice(raw.indexOf("{")));
   assert.equal((output.errors||[]).filter(e=>e.severity==="error").length,0);
   const c=output.contracts?.["contracts/EchoStaking.sol"]?.EchoStaking;
   assert.ok(c?.evm?.bytecode?.object,"Verified staking bytecode missing");
   staking=await new ethers.ContractFactory(c.abi,"0x"+c.evm.bytecode.object,owner).deploy(token.target);
   await staking.waitForDeployment();
   for(const signer of [alice,bob]){
     await(await token.mint(signer.address,U(3000))).wait();
     await(await token.connect(signer).approve(staking.target,U(3000))).wait();
   }
   await invariant();
 });

 it("preserves accounting across two validators, rewards, slashing, reactivation and withdrawals",async function(){
   await(await staking.connect(alice).stake(U(1500))).wait(); await invariant();
   await(await staking.connect(bob).stake(U(1000))).wait(); await invariant();
   await(await token.approve(staking.target,U(300))).wait();
   await(await staking.fundRewards(U(300))).wait(); await invariant();
   await(await staking.distributeReward(alice.address,U(80))).wait(); await invariant();
   await(await staking.slash(bob.address,ethers.id("bob-incident"))).wait(); await invariant();
   assert.equal(await staking.getValidatorStake(bob.address),U(900));
   await(await staking.reactivateValidator(bob.address)).wait(); await invariant();
   await(await staking.connect(bob).stake(U(100))).wait(); await invariant();
   await ethers.provider.send("evm_increaseTime",[90*24*3600+2]);
   await ethers.provider.send("evm_mine",[]);
   await(await staking.connect(alice).requestUnstake()).wait(); await invariant();
   await ethers.provider.send("evm_increaseTime",[24*3600+2]);
   await ethers.provider.send("evm_mine",[]);
   await(await staking.connect(alice).withdraw(U(500))).wait(); await invariant();
   await(await staking.connect(alice).withdraw(U(1000))).wait(); await invariant();
   assert.equal(await staking.getValidatorStake(alice.address),0n);
 });

 it("failed operations and unauthorized actions cannot change reserved balances",async function(){
   await(await staking.connect(alice).stake(U(1000))).wait(); await invariant();
   const snapshot=async()=>[
     await staking.totalStaked(),await staking.rewardPool(),
     await token.balanceOf(staking.target),
     await staking.getValidatorStake(alice.address),
     await staking.getValidatorStake(bob.address)
   ];
   const before=await snapshot();
   const attempts=[
     ()=>staking.connect(outsider).slash(alice.address,ethers.id("outsider-slash")),
     ()=>staking.connect(outsider).distributeReward(alice.address,U(1)),
     ()=>staking.connect(bob).stake(U(999)),
     ()=>staking.connect(alice).withdraw(U(100)),
     ()=>staking.rescueExcessTokens(token.target,owner.address,U(1))
   ];
   for(const attempt of attempts){
     await assert.rejects(async()=>{await(await attempt()).wait();});
     assert.deepEqual(await snapshot(),before);
     await invariant();
   }
 });

 it("separates unsolicited ECHO donations from reserved balances",async function(){
   await(await staking.connect(alice).stake(U(1000))).wait(); await invariant();
   await(await token.transfer(staking.target,U(75))).wait(); await invariant();
   assert.equal(await staking.availableExcessEcho(),U(75));
   await(await staking.rescueExcessTokens(token.target,owner.address,U(25))).wait(); await invariant();
   assert.equal(await staking.availableExcessEcho(),U(50));
   await assert.rejects(async()=>{await(await staking.rescueExcessTokens(token.target,owner.address,U(51))).wait();});
   await invariant();
   await(await staking.rescueExcessTokens(token.target,owner.address,U(50))).wait(); await invariant();
   assert.equal(await token.balanceOf(staking.target),U(1000));
 });
});
