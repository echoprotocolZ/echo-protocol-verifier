# Echo Protocol Z V4 — Updated Independent Audit Handoff

**Target branch:** `release/v4-security-review-candidate-2026-11`
**Prior frozen baseline:** `18fedbdd33e0ed365a34fda260775ac6f9c66fb4`
**Status:** **NO-GO for mainnet.** This document is not an audit opinion.

## Evidence and scope
Operator reports **392 passing (3m)** after cross-function reentrancy hardening. This output has not been independently captured or cryptographically attached to the release. Preserve `git rev-parse HEAD`, lockfile, compiler settings, full test log, and compiled bytecode hashes before handing off.

GitHub compare against prior baseline: **7 commits ahead, 0 behind**, five changed paths:
- `contracts/EchoSmartAccountV4.sol`: execution modifier now also consults overridable `_isProofAdministrationLocked()`; `executionLock` is internal.
- `contracts/EchoSmartAccountV4DelegationCandidate.sol`: proof-admin functions now check both `delegationLock` and `executionLock`; override exposes proof-admin lock state to base execution.
- `contracts/EchoContractOwnerCallbackProbe.sol`: test-only owner callback fixture.
- `test/echo-v4-admin-callback-boundary.js`: tests unauthorized callback from an external target.
- `test/echo-v4-contract-owner-cross-function.js`: tests valid proof-admin callback from a smart-contract owner while execution is active.

## Security review requirements
1. Inspect the **actual implementation** of both locks and prove they cannot be bypassed via nested execution, owner-contract callbacks, bridge/registry callbacks, and administrative flows. A passing test only establishes the exercised cases.
2. Verify proof signal/nonce consistency and no unintended state consumption on reverts, including checkpoint and nullifier handling.
3. Review the unrestricted external call surface, indirect routing through intermediaries, ERC-20 allowance/transfer policy and value movement. The direct protected-target denylist alone is not a complete capability sandbox.
4. Review account-scoped delegatee permissions, global nullifier mapping, chain/domain separation, validator trust and geographic-policy revocation.
5. Verify V3/V4 circuits, witness generation, verification keys, Solidity verifier bytecode and deployment scripts are consistent with the audited commit.
6. Verify test fixtures and debug scripts are excluded from production deployment. Never include private keys, seed phrases, API tokens, or `.env` in auditor archives.
7. Capture a clean reproducible `npm ci && npx hardhat clean && npx hardhat compile && npx hardhat test` run in an isolated checkout of the **exact target SHA**.
8. Obtain independent auditor findings and resolution, Amoy rehearsal, operational signer/Safe policy review, and explicit mainnet authorization.

## Release decision
**NO-GO** until the independent Solidity/ZK audit is complete, high/critical findings resolved, exact release SHA pinned, bytecode verified, and deployment formally approved.

## Auditor reproduction
```bash
git fetch origin
git switch release/v4-security-review-candidate-2026-11
git rev-parse HEAD
npm ci
npx hardhat clean
npx hardhat compile
npx hardhat test
```
