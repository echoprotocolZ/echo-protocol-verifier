# Issue #3 — fail-closed indirect token spending remediation design

Status: **DESIGN PROPOSAL — NOT IMPLEMENTED — RELEASE BLOCKED**.

## Confirmed threat model

The real-proof test in `test/echo-z-positive-initialization.js` demonstrates that a factory-initialized EchoSmartAccountZ can execute a valid V3/V4 proof-authorized call to an allowlisted indirect spender that pulls an unmonitored ERC-20 using a pre-existing allowance. The monitored token's budget counter does not change. This is a real production-code-path weakness under the tested allowance precondition; it is not evidence that an arbitrary outsider can execute without proofs or allowlisting.

## Recommended security invariant

Every authorized execution must either:

1. Be a narrowly defined, independently verified asset operation (e.g. the existing atomic stake route with exact token, amount, zero inherited allowance, and postconditions), **or**
2. Be proven incapable of decreasing *any* account-held asset outside its authorized spending policy.

The existing target/selector allowlist alone does not establish condition 2. Neither does checking only one token balance.

## Proposed fail-closed implementation strategy

**Phase A — define supported execution surfaces**

- Preserve the existing atomic staking path with its zero-allowance checks and balance postconditions.
- Preserve direct ERC-20 `transfer` only for the configured monitored token and only with existing policy and cumulative budget enforcement.
- For generic contract calls, require an explicit separate capability for audited, non-asset-moving targets. Do not grandfather existing target/selector approvals into that capability.
- Until such a capability and target review are implemented, reject generic agent calls that cannot be proven safe. This is deliberately breaking and needs compatibility review.

**Phase B — account for asset classes and legacy state**

- Inventory ERC-20, ERC-721, ERC-1155, native assets and any protocol-specific withdrawal rights supported by the account.
- Define what happens when an account already holds an unregistered token or has an inherited allowance. Arbitrary unknown assets cannot be enumerated on-chain by inspecting ERC-20 balances.
- Explicitly revoke or migrate known legacy allowances where feasible. A one-time cleanup is not a substitute for execution-time enforcement.
- Consider an immutable, audited target adapter model for approved external interactions; an adapter must enforce its own exact asset deltas and reject unexpected effects.

**Phase C — security acceptance tests**

- Modify the existing genuine V3/V4 proof test so the unmonitored legacy-allowance pull **must revert**.
- Assert unchanged account/recipient token balances, allowance, nonce, cumulative spending and unconsumed nullifier after rejection.
- Retain monitored in-budget success, monitored over-budget rollback, atomic stake allowance cleanup, and proof replay tests.
- Add a differently named indirect-spender function to prevent a selector-only patch from passing.
- Check nested calls, proxy/delegatecall-like execution surfaces, native value movement, token hooks, and reentrancy.
- Run complete artifact-backed Hardhat tests and obtain independent contract review before merge.

## Explicit non-solutions

- Denying only `pull(address,address,address,uint256)` or `transferFrom` selectors on the **outer** call.
- Trusting an allowlisted target solely because its selector is approved.
- Assuming `monitoredToken[agent]` covers all ERC-20 assets.
- Treating the existing 267 green tests as proof that Issue #3 is fixed.

## Engineering decision before code change

Choose whether Echo Protocol Z should **(A)** temporarily block all generic agent external calls except specifically implemented asset operations, or **(B)** retain generic calls only behind a new explicit, independently audited target capability. Both require a compatibility and threat-model review. The safest immediate mitigation is A, but it is intentionally restrictive.

Do not deploy or merge to production while Issue #3 remains open.
