# ECHO token allocation reconciliation and vesting acceptance checklist

**Status:** Draft implementation gate; no transfer, deployment, vesting contract, or allocation assignment authorized. Parent: `docs/ECHO_Z_TOKENOMICS_UTILITY_DRAFT.md`.

## Approved working allocation (not executed)

| Category | Percent | Units |
|---|---:|---:|
| Community and ecosystem | 25% | 25,000,000 |
| Network and staking incentives | 20% | 20,000,000 |
| Treasury and security | 20% | 20,000,000 |
| Founders and contributors (combined) | 20% | 20,000,000 |
| Liquidity | 10% | 10,000,000 |
| Advisors | 5% | 5,000,000 |
| **Total** | **100%** | **100,000,000** |

Proposed equal founder split: 10,000,000 ECHO each, **not yet confirmed as an individual assignment**. No wallets have been assigned to allocations.

## Phase 1: chain reconciliation — mandatory before any movement

- [ ] Verify Polygon chain ID 137 and the intended ECHO token contract `0x9511Ee84398B8Deb725d8967c16693C96C43e0eD`, its bytecode, decimals, totalSupply, and ownership.
- [ ] Identify the reported duplicate token deployment and document whether it is a distinct token, with its separate total supply. Never sum distinct contracts into the intended token supply.
- [ ] Obtain a complete holder and custody inventory for the intended token contract at a named block: wallet, balance, custody/control evidence, restrictions, and any contract-held balances.
- [ ] Reconcile `sum(holder balances) == totalSupply` for that contract at the same block; account for burns and zero-address conventions.
- [ ] Distinguish *proposed allocations* from actual holdings and any previously sold, transferred, pledged, or committed tokens.
- [ ] Determine whether the full proposed allocation can be satisfied from available, legally controlled balances without taking tokens from other holders.
- [ ] Verify all multisig addresses, signer control, thresholds, and Safe implementation provenance independently.

## Phase 2: founder vesting decision

Proposed combined founder pool: 20,000,000 ECHO. Proposed **12-month cliff plus 36 monthly releases after the cliff**; total duration 48 months. These terms remain unapproved.

Required choices:
1. Confirm individual founder split and beneficiary wallets.
2. Confirm start timestamp (no automatic backdating) and exact definition of a month (calendar dates or fixed seconds).
3. Define cliff behavior: zero unlock before cliff; whether first installment unlocks at month 13 or a tranche unlocks at the 12-month cliff.
4. Define revocation rights, resignation/termination, death/inheritance, transferability, and emergency recovery.
5. Confirm funding source and whether tokens are escrowed upfront, and custody/audit policy.
6. Approve independent audit of any vesting implementation before funding.

### Proposed vesting acceptance tests (local only)

- No beneficiary may claim before cliff.
- At every vesting boundary, cumulative claimable never exceeds the beneficiary's total grant.
- No claim can exceed unlocked minus already claimed; repeated claim cannot double-spend.
- Wrong beneficiary, wrong token, wrong chain, and unauthorized grant edits revert.
- Revocation/recovery behavior exactly matches approved written policy.
- Conservation: escrow balance plus all claims and authorized recoveries equals initial funding, accounting for any explicitly allowed token mechanics.
- Tests cover boundary timestamps, leap years/month-length rules, rounding dust, zero amounts, and multiple beneficiaries.
- Safe custody and authorized administration require real-signature tests, not merely impersonated self-calls.

## Phase 3: release gate

- [ ] Approve founder split and vesting terms in writing.
- [ ] Complete on-chain token and holder reconciliation.
- [ ] Obtain relevant legal/tax and independent smart-contract security review.
- [ ] Verify production source-to-bytecode equivalence for all contracts relied on.
- [ ] Publish factual allocation disclosures and custody addresses only after verification.
- [ ] Require a separate explicit authorization for any token movement or deployment.

**No APY, revenue, liquidity, circulating-supply, or founder payout claim is established by this checklist.**
