# Echo Protocol Z CI coverage snapshot — 2026-11-15

Source: GitHub Actions run [43764472224](https://github.com/echoprotocolZ/echo-protocol-verifier/actions/runs/43764472224), artifact `artifact-independent-coverage` (ID 14181875704).

## Verified results

- `v4-security`: success; 13 passing tests.
- `artifact-independent`: success; 664 passing tests, from 130 selected test files.
- `v4-circuit-build`: success; 12 V4 geographic witness checks (3 accepted, 9 rejected).
- `full-suite-diagnostic`: skipped by branch guard.
- The artifact reports **39 excluded files**. Excluded does **not** mean failed, nor does passing witness generation establish a Groth16 proof.

## Follow-up coverage groups

### V3/V4 real proof generation and execution
`echo-v3-real-authorization-integration`, `echo-v3-real-groth16-valid-fixture`, `echo-v3-real-proof`, `echo-v3-timestamp-real-proof`, `echo-v4-real-coordinated-dual-proof`, `echo-v4-real-dual-proof-integration`, `echo-v4-real-groth16-valid-proof`, `echo-v4-real-proof-to-execution`, `echo-v4-solidity-proof`.

### Delegation, geographic authorization, rollback, replay and callbacks
`echo-v4-admin-callback-boundary`, `echo-v4-atomic-rollback-retry`, `echo-v4-contract-owner-cross-function`, `echo-v4-delegation-external-lifecycle`, `echo-v4-delegation-fresh-proof-cross-account`, `echo-v4-delegation-gas-benchmark`, `echo-v4-delegation-real-proof-adversarial`, `echo-v4-delegation-real-proof-cross-account`, `echo-v4-delegation-real-proof-positive`, `echo-v4-execution-atomic-rollback`, `echo-v4-gateway-error-security`, `echo-v4-geographic-admin-adversarial`, `echo-v4-geographic-admin-atomic-rollback`, `echo-v4-geographic-admin-real-proof-lifecycle`, `echo-v4-geographic-gateway`, `echo-v4-geographic-revocation-isolation-fixed`, `echo-v4-protected-target-boundaries`, `echo-v4-reentrancy-cross-account`.

### Staking and production evidence
`echo-staking-production-accounting-invariants`, `echo-staking-production-adversarial-token`, `echo-staking-verified-production-bytecode-security`, `echo-z-real-proof-staking-adversarial`, `echo-z-real-proof-staking-budget-rollback`, `echo-z-real-proof-staking-integration`.

### Additional fixture/legacy/artifact tests
`echo-v2-local-full-flow`, `echo-v2-local-real-proof`, `echo-z-artifact-integrity`, `echo-z-positive-initialization`, `full-flow`, `real-proof`.

## Next acceptance gates

1. Reproduce disposable V3 and V4 proof fixtures from documented circuit sources and clearly distinguish them from production trusted setup.
2. Execute a proof-dependent integration CI job and record test names and failures.
3. Rebuild and verify the production-bytecode evidence separately.
4. Replace heuristic test exclusion with an explicit, reviewed manifest; fail when any test file is unclassified.
5. Keep mainnet deployment blocked until proof execution, replay/nullifier, staking, and admin paths are all verified.

This snapshot is descriptive, not a claim of full-suite coverage or audit approval.
