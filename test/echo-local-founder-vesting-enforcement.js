const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");
describe("Echo founder vesting fixture enforcement", function () {
  it("rejects early and unauthorized claims, prevents double claims and conserves escrow", async function () {
    const [owner, beneficiary, outsider] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("EchoVestingTestToken")).deploy();
    await token.waitForDeployment();
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const times = Array.from({length:37}, (_,i)=>now+1000+i*1000);
    const fixture = await (await ethers.getContractFactory("EchoFounderVestingFixture")).deploy(token.target, beneficiary.address, times);
    await fixture.waitForDeployment();
    const grant = ethers.parseEther("10000000");
    await (await token.mint(fixture.target, grant)).wait();
    await assert.rejects(async()=>{await (await fixture.connect(beneficiary).claim()).wait();});
    await network.provider.send("evm_setNextBlockTimestamp",[times[0]]);
    await network.provider.send("evm_mine");
    await assert.rejects(async()=>{await (await fixture.connect(outsider).claim()).wait();});
    await (await fixture.connect(beneficiary).claim()).wait();
    assert.equal(await token.balanceOf(beneficiary.address),grant/4n);
    await assert.rejects(async()=>{await (await fixture.connect(beneficiary).claim()).wait();});
    await network.provider.send("evm_setNextBlockTimestamp",[times[36]]);
    await (await fixture.connect(beneficiary).claim()).wait();
    assert.equal(await fixture.claimed(),grant);
    assert.equal(await token.balanceOf(beneficiary.address),grant);
    assert.equal(await token.balanceOf(fixture.target),0n);
  });
});
