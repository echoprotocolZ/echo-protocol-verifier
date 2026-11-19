# Echo Protocol Z — Tokenomics and Utility Framework (DRAFT)

**Status: PROPOSAL ONLY — NOT APPROVED OR LIVE.** Prepared 2026-11-19. This document is for founder review and audit planning, not an offer, return promise, or claim of current allocation. Do not publish as finalized tokenomics without explicit approval and on-chain reconciliation.

## 1. Token identity and supply boundary

- Intended token: ECHO, ERC-20 on Polygon, 18 decimals.
- Reported intended maximum supply of the designated token contract: **100,000,000 ECHO**.
- Reported designated token address: `0x9511Ee84398B8Deb725d8967c16693C96C43e0eD` — **reverify chain, contract code, supply, and ownership before public publication**.
- A second token deployment was previously reported. Its supply is **not automatically part of the designated token's supply**; investigate provenance and distinguish the contracts before publishing circulating supply.
- No circulating-supply, holder-distribution, treasury-balance, liquidity, valuation, or sale-price claim is verified by this document.

## 2. Proposed allocation — not executed

| Allocation | Share | ECHO | Proposed controls |
|---|---:|---:|---|
| Community and ecosystem participation | 30% | 30,000,000 | Published eligibility and anti-sybil rules; staged release |
| Network incentives and staking reward reserve | 20% | 20,000,000 | Explicit funded reserve; audited payout and accounting |
| Protocol treasury and security | 20% | 20,000,000 | Multisig-controlled budgets; audit and operations reporting |
| Founders and core contributors | 15% | 15,000,000 | 12-month cliff then 36-month monthly vesting (proposal) |
| Liquidity and market infrastructure | 10% | 10,000,000 | Separate approval, documented counterparties and custody |
| Advisors and strategic contributors | 5% | 5,000,000 | 6-month cliff then 24-month monthly vesting (proposal) |
| **Total** | **100%** | **100,000,000** | **No transfers or assignments authorized** |

**Founder allocation is a shared 15% pool, not 15% per founder.** Exact beneficiaries, amounts, vesting start, clawbacks, and custody must be decided before implementation. These categories describe a *proposed allocation of existing supply*, not permission to mint additional tokens.

## 3. Utility — distinguish present code from future design

**Source-reviewed staking behavior (NOT confirmed production-bytecode equivalent):** 1,000 ECHO minimum cumulative stake, nominal 90-day lock, 24-hour unbonding after request, separately funded reward pool, privileged reward distribution, and slashing of up to 100 ECHO per incident in the reviewed source. Owner/registry/oracle privileges and quarantine require independent audit. See `docs/ECHO_STAKING_PRODUCTION_SOURCE_REVIEW.md`.

**Proposed utility, not verified live:** network participation incentives; proof-of-routing or validator rewards where actual verified work and abuse controls exist; fee discounts or payment for supported protocol services; governance only if separately designed and reviewed. No assumption that the current protocol has functioning fee revenue, decentralized routing, or permissionless rewards.

## 4. Staking reward economics — no invented APY

- **No guaranteed yield or fixed APY.** A reward reserve does not itself create revenue.
- Distribution must be capped by actual funded, spendable rewards and audited accounting; staking principal must not be used to disguise rewards.
- Publish a formula before activation, e.g. `period_reward = min(approved_period_budget, funded_reward_balance, verified_eligible_weight * approved_rate)`. This is a **conceptual budget cap**, not deployed contract logic.
- Specify eligible activity, slashing evidence, appeal process, lock renewal behavior, payout frequency, unused-budget handling, and governance authority.
- Do not announce reward rates, reward schedules, or launch dates until implementation, funding, and security review are complete.

## 5. Treasury, vesting and transparency controls

- Proposed treasury custody: independently verified multisig, with named signers, documented threshold, and transaction approval policy. A test Safe is not a production Safe.
- Proposed founder vesting: 12-month cliff followed by 36 monthly installments; no automatic retroactive vesting. Implementation must be audited and funded.
- Proposed advisor vesting: 6-month cliff followed by 24 monthly installments.
- Publish wallet addresses and reconciled balances only after verification; segregate locked allocations, circulating holdings, operational funds, and liquidity.
- Publish a quarterly treasury/reward reconciliation and disclosures of privileged roles and conflicts.

## 6. Revenue model — proposed, not proven

Possible revenue sources for future evaluation: fees for verified routing/authorization services, business integrations, developer infrastructure, and optional premium services. Each needs a concrete paying customer, price schedule, settlement flow, legal review, and implemented accounting. **Current protocol revenue is not verified.** Token appreciation and secondary-market activity are not protocol operating revenue.

## 7. Open decisions / release gates

1. Founders approve or amend the six allocation percentages and beneficiary rules.
2. Reconcile designated ECHO token identity, duplicate deployment, current supply and holder balances on Polygon.
3. Verify deployed staking runtime against exact source, compiler settings and constructor parameters.
4. Determine whether staking rewards are funded, what they pay for, and whether privileged slashing is acceptable.
5. Specify governance, multisig custody, vesting implementation, emissions and anti-abuse protections.
6. Obtain independent security and relevant legal/regulatory review before any token sale, reward marketing, or launch claims.
7. Prepare a public tokenomics page only after the above facts are confirmed and proposals approved.

## 8. Explicit exclusions

This draft does not execute transfers, establish ownership, create vesting contracts, alter token supply, promise profits, authorize a token sale, approve mainnet deployment, or certify regulatory compliance.
