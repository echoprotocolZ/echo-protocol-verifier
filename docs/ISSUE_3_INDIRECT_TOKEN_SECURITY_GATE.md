# Issue #3 — Z indirect ERC-20 spending security gate

Status: **OPEN — NOT PRODUCTION-READY**.

## Verified by automated tests

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
