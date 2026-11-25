const assert = require("node:assert/strict");

// Local arithmetic acceptance model only; not a deployed contract test.
// Elapsed completed months are inputs; timestamp conversion remains undecided.
const GRANT = 10_000_000n * 10n ** 18n;
function vested(month) {
  if (!Number.isSafeInteger(month) || month < 0) throw new RangeError("month");
  return month < 12 ? 0n : GRANT * BigInt(Math.min(month, 48)) / 48n;
}
describe("Echo Z approved founder vesting arithmetic", function () {
  it("locks both grants until month 12 and releases exactly 25 percent at cliff", function () {
    for (let m = 0; m < 12; m++) assert.equal(vested(m), 0n);
    assert.equal(vested(12), GRANT / 4n);
  });
  it("releases monotonically and conserves both grants through month 48", function () {
    let paid = vested(12);
    for (let m = 13; m <= 48; m++) {
      const installment = vested(m) - paid;
      assert(installment > 0n);
      paid += installment;
      assert.equal(paid, vested(m));
      assert(paid <= GRANT);
    }
    assert.equal(paid, GRANT);
    assert.equal(2n * paid, 20_000_000n * 10n ** 18n);
    assert.equal(vested(49), GRANT);
  });
  it("reconciles approved allocation with the 100 million token cap", function () {
    assert.equal(25n + 20n + 20n + 20n + 10n + 5n, 100n);
    assert.equal(2n * GRANT, 20_000_000n * 10n ** 18n);
  });
});
