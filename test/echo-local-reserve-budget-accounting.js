const assert = require("node:assert/strict");
const E = 10n ** 18n;
const CAP = 20_000_000n * E;
// Acceptance model only; no production contract or multisig interaction.
function payout(request, funded, spent, budget) {
  for (const n of [request,funded,spent,budget]) assert(n >= 0n);
  assert(spent <= CAP);
  return [request,funded,CAP-spent,budget].reduce((a,b)=>a<b?a:b);
}
describe("Echo Z reserve accounting acceptance model", function () {
  it("caps staking rewards by funded rewards, period budget and lifetime allocation", function () {
    assert.equal(payout(100n*E,40n*E,0n,80n*E),40n*E);
    assert.equal(payout(100n*E,200n*E,0n,80n*E),80n*E);
    assert.equal(payout(100n*E,200n*E,CAP-1n,80n*E),1n);
    assert.equal(payout(100n*E,0n,0n,80n*E),0n);
  });
  it("excludes staking principal from the funded reward balance", function () {
    const principal=1000n*E, balance=principal+50n*E;
    const paid=payout(100n*E,balance-principal,0n,100n*E);
    assert.equal(paid,50n*E);
    assert.equal(balance-paid,principal);
  });
  it("keeps treasury and reward allocations separate and rejects overdrawn accounting", function () {
    const reward=payout(CAP,CAP,0n,CAP);
    const treasury=payout(CAP,CAP,CAP-5n*E,CAP);
    assert.equal(reward,CAP);
    assert.equal(treasury,5n*E);
    assert.equal(payout(1n,CAP,CAP,CAP),0n);
    assert.throws(()=>payout(1n,CAP,CAP+1n,CAP));
    assert.throws(()=>payout(1n,-1n,0n,CAP));
  });
});
