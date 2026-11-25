const assert = require("node:assert/strict");

// Acceptance model, not production Solidity. All dates are UTC.
// Anchor every anniversary to the original day, not the previous month.
function anniversary(start, month) {
  const d = new Date(start);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + month, 1,
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d.getUTCDate(), last));
  return first.getTime();
}
const grant = 10_000_000n * 10n ** 18n;
function vested(start, now) {
  let m = 48;
  while (m >= 12 && now < anniversary(start, m)) m--;
  return m < 12 ? 0n : grant * BigInt(m) / 48n;
}
describe("Echo Z founder UTC calendar acceptance model", function () {
  it("clamps leap anniversaries without permanent day drift", function () {
    const start = Date.parse("2024-02-29T15:00:00Z");
    assert.equal(new Date(anniversary(start, 12)).toISOString(), "2025-02-28T15:00:00.000Z");
    assert.equal(new Date(anniversary(start, 48)).toISOString(), "2028-02-29T15:00:00.000Z");
  });
  it("anchors month-end installments to the original date", function () {
    const start = Date.parse("2026-01-31T15:00:00Z");
    assert.equal(new Date(anniversary(start, 13)).toISOString(), "2027-02-28T15:00:00.000Z");
    assert.equal(new Date(anniversary(start, 14)).toISOString(), "2027-03-31T15:00:00.000Z");
  });
  it("enforces exact boundary arithmetic for all 37 release dates", function () {
    const start = Date.parse("2026-01-31T15:00:00Z");
    for (let m = 12; m <= 48; m++) {
      const t = anniversary(start, m);
      assert.equal(vested(start, t - 1000), m === 12 ? 0n : grant * BigInt(m - 1) / 48n);
      assert.equal(vested(start, t), grant * BigInt(m) / 48n);
    }
    assert.equal(vested(start, anniversary(start, 49)), grant);
  });
});
