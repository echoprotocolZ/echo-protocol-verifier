#!/usr/bin/env node
"use strict";
// Local-only arithmetic regression for the approved working tokenomics plan.
// Not a token distribution, a contract vesting implementation, or an on-chain audit.
const assert = require("node:assert/strict");
const TOTAL = 100_000_000n;
const allocation = Object.freeze({
  community: 25_000_000n,
  networkIncentives: 20_000_000n,
  treasurySecurity: 20_000_000n,
  founders: 20_000_000n,
  liquidity: 10_000_000n,
  advisors: 5_000_000n
});
const founderA = 10_000_000n, founderB = 10_000_000n;
assert.equal(Object.values(allocation).reduce((sum, n) => sum + n, 0n), TOTAL, "Allocation must equal total planned supply");
assert.equal(founderA + founderB, allocation.founders, "Founder grants must equal combined pool");
assert.equal(founderA, TOTAL / 10n, "Each founder planned at 10%");
assert.equal(founderB, TOTAL / 10n, "Each founder planned at 10%");
assert.equal(allocation.community, TOTAL / 4n, "Community planned at 25%");
assert.ok(Object.values(allocation).every(n => n >= 0n), "No negative allocation");
const cliffMonths = 12, releaseMonths = 36;
assert.equal(cliffMonths + releaseMonths, 48, "Approved working schedule is 48 months");
console.log("PASS: Six allocations sum to 100,000,000 ECHO");
console.log("PASS: Combined founder pool 20,000,000 ECHO; equal 10,000,000 ECHO grants");
console.log("PASS: Working schedule is 12-month cliff plus 36 monthly releases");
console.log("LIMITATION: No vesting timestamps, unlock-at-cliff policy, beneficiary addresses, funding, deployed contracts, or holder balances verified.");
console.log("LOCAL ONLY: No RPC calls, signatures, transfers, or deployments.");
