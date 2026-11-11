# Issue #3 — Z indirect ERC-20 spending security gate

Status: **OPEN — NOT PRODUCTION-READY**.

## Verified by automated tests

- Direct ERC-20 `approve`, `transferFrom`, and unmonitored `transfer` selectors are rejected by Z's execution-policy hook.
- A local-only harness calls the production balance-accounting hooks around an indirect token pull.
- With a configured monitored token, over-budget indirect outflows revert atomically, while in-budget outflows consume cumulative budget.
- With no monitored token configured, the isolated hooks do **not** account for an indirect token outflow under a pre-existing allowance.

These findings describe **isolated hooks and ERC-20 behavior**, not an exploit proven through the real V3/V4 proof-authorized `executeAuthorized` entrypoint.

## Required end-to-end acceptance tests

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
