# Issue #3 — Z indirect ERC-20 spending security gate

Status: **OPEN — NOT PRODUCTION-READY**.

## November 2026 remediation checkpoint — 267 passing (user-reported)

**Status: OPEN / mainnet blocked.** The earlier exploit descriptions above are historical reproductions, not a claim that the current restricted execution policy still admits generic indirect calls. The current branch enforces an Option A allowlist in `EchoSmartAccountZ._validateExecutionPolicy`: only direct `transfer(address,uint256)` on the delegatee's monitored token or `stake(uint256)` on a registered and approved staking target; arbitrary indirect spenders are rejected. The staking helper independently checks the trusted target and factory-approved runtime codehash, monitored token identity, exact monitored balance decrease, and zero final allowance.

**Real-proof regressions:** the malicious staking fixture attempting to pull an unrelated legacy-approved ERC-20 is rejected at registration. Revoking a previously approved staking codehash blocks execution and preserves nonce/nullifier. The two-step factory staking-code approval authority handoff rejects unauthorized acceptance and stale-authority approvals. User reports 267 passing, 0 failing, 54 seconds after the latest staking helper hardening commit `4f0f65d`.

### Remaining release blockers — do not interpret codehash approval as an audit

1. **Approval governance:** the factory's `stakingCodeAuthority` can approve arbitrary runtime codehashes; a compromised or mistaken authority can approve a malicious implementation. Two-step transfer protects handoff, not the approval decision. Move the authority to a properly configured multisig with documented signer threshold, monitoring, and emergency revocation process. No on-chain Safe ownership migration has been performed here.
2. **Runtime codehash is not target identity:** different deployments of the same runtime bytecode may have different constructor-initialized storage and token bindings. A proxy's codehash identifies its proxy bytecode, not its mutable implementation. Require explicit reviewed target addresses and constructor/state invariants, or reject proxies and mutable implementations; inspect the actual staking source and deployment bytecode.
3. **Legacy allowances for unrelated assets:** the smart account cannot enumerate or revoke all ERC-20 allowances across arbitrary tokens. Its safety currently depends on the strict call allowlist **and** the integrity of approved staking code. A compromised approved staking implementation may pull unrelated assets through existing allowances without affecting monitored-token balance accounting.
4. **Token behavior:** nonstandard, callback-capable, upgradeable or malicious ERC-20 contracts can violate assumptions behind `balanceOf`, `approve`, and `transferFrom`. Audit token and staking implementations together.
5. **Additional tests and review:** verify duplicate-codehash/different-constructor-state deployments, proxy upgrade behavior, emergency revocation under in-flight proof, reentrancy, nonstandard ERC-20 return behavior, and the complete administrative call graph. Run static analysis and obtain an independent smart-contract audit before production.
6. **Documentation cleanup:** historical test findings in this document refer to the vulnerable pre-Option-A branch. Preserve them as regression history; do not label the current branch exploitable solely on those historical results.

**Closure criterion:** documented production staking target identity and code review, multisig-controlled approval with emergency procedure, adversarial end-to-end coverage for the remaining paths, full suite passing, and independent audit findings addressed. Until then, Issue #3 remains open and deployment is blocked.

---

## Historical findings and automated tests (pre-remediation)

- Direct ERC-20 `approve`, `transferFrom`, and unmonitored `transfer` selectors are rejected by Z's execution-policy hook.
- A local-only harness calls the production balance-accounting hooks around an indirect token pull.
- With a configured monitored token, over-budget indirect outflows revert atomically, while in-budget outflows consume cumulative budget.
- With no monitored token configured, the isolated hooks do **not** account for an indirect token outflow under a pre-existing allowance.

## Confirmed real-proof integration finding (release blocker)

`test/echo-z-positive-initialization.js` already contains a full-path regression using a factory-initialized `EchoSmartAccountZ`, the real V3/V4 proof generator and bridge, and an explicitly allowlisted `EchoIndirectTokenSpenderTestMock`. A Hardhat-impersonated account seeds **legacy allowances solely as fixture setup**; the actual indirect transfers use the production `executeAuthorized` entrypoint with genuine proofs.

- An allowlisted monitored-token pull within the remaining budget succeeds and consumes cumulative budget; an over-budget pull reverts with `SpendingBudgetExceeded`, preserving balances, nonce and unconsumed nullifier.
- An allowlisted **unmonitored-token** pull under a seeded legacy allowance **succeeds**. The recipient gains tokens, the account loses tokens, its nonce advances, and the proof nullifier is consumed, while `tokenSpendingUsed[agent][unmonitoredToken]` does not increase.
- The integration test deliberately **asserts this unsafe success** to document the open release gate. A passing test suite therefore **does not imply safety**.

This is a confirmed production-code-path authorization/accounting weakness under the tested legacy-allowance precondition, not evidence of a publicly exploitable deployment or a bypass without valid proofs, an allowlisted target, and an allowance. The security branch must not be considered release-ready.

## Additional Option A review finding: staking target identity

The strict execution policy currently permits a call with the `stake(uint256)` selector to any code-bearing target that also passes the account-scoped target/selector policy. The atomic stake helper checks `echoToken()`, inherited allowance zero for the **monitored** token, exact monitored-token balance decrease, and post-call allowance cleanup. These conditions do **not** prove that the target is an independently trusted staking implementation or that it cannot use a **different token's** pre-existing allowance during its `stake` call.

A malicious or compromised staking-like contract could potentially satisfy the monitored-token postconditions while spending unrelated assets if an account already granted it an allowance. This is a **reasoned residual risk**, not yet a demonstrated real-proof exploit. Do not close Issue #3 on the strength of the current 267 passing tests.

**Additional acceptance gate:** require an explicitly reviewed staking target identity bound to the account's authorization policy, not merely the selector or `echoToken()` return value. Establish a governance-controlled, proof-authorized registration or a deliberately immutable target binding with reviewed upgrade/proxy assumptions. Add a real-proof adversarial staking-like contract test that attempts to spend an unmonitored token under a legacy allowance; assert atomic rollback of all balances, allowances, nonce and nullifier. Consider direct token hooks and token-implementation trust separately.

## Required remediation

1. Choose a fail-closed asset/target policy that prevents authorized indirect calls from moving unbudgeted assets, including via legacy allowances. The current one-monitored-token-per-agent design does not enforce this property.
2. Change the full-path unmonitored-token test from an expected successful pull to an **expected revert**, asserting unchanged token balances, allowance, nonce, budget counters and unconsumed nullifier.
3. Retain the real-proof monitored-token in-budget and over-budget cases and all staking/rollback regressions.
4. Re-run the complete artifact-backed Hardhat suite and review the resulting contract changes before considering a production merge.



## End-to-end acceptance checklist (some cases already demonstrated)

1. Deploy a factory-initialized Z account with real agent policy registry, attestation registry, V4 authorization bridge, and geographical proof dependencies.
2. Authorize a call to an allowlisted adversarial target using valid V3/V4 proofs and a signed checkpoint bound to target, calldata, and nonce. Do not substitute a permissive mock verifier for the security conclusion.
3. Test an indirect `transferFrom` with a pre-existing account allowance, for a monitored token: reject over-budget, accept in-budget, account cumulatively, and prove rollback of token balances and nonce on rejection.
4. Test an unmonitored token with a pre-existing allowance and an allowlisted adversarial target; establish whether the full authorization policy permits an actual unbudgeted outflow.
5. Verify selector collision behavior for non-ERC20 allowlisted targets, and validate whether rejecting selectors by their four-byte values alone causes unintended denials.
6. Verify reentrancy resistance, proof/nullifier replay resistance, staking allowance cleanup, and that failed transactions do not consume a nonce.
7. Run the complete Hardhat suite, including artifact-backed proof tests, and require green CI before any merge.

## Design decision required before closing

The current model monitors **one ERC-20 token per agent**. A contract cannot infer arbitrary indirect token transfers merely from the outer call's selector. Choose and audit an enforceable policy for other assets (for example, strictly scoped target contracts with no pre-existing allowance, or explicit per-token balance accounting for every token the account can hold). Neither option is universally safe without a defined asset inventory and trust boundary.

No mainnet deployment, token movement, or production merge is authorized by this document.
