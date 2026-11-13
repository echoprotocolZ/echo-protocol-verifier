# Echo Protocol Z — V4 Independent Audit Handoff

**Audit target:** `18fedbdd33e0ed365a34fda260775ac6f9c66fb4` (`release/v4-audit-candidate-2026-11`).
**Handoff branch:** `audit/v4-handoff-2026-11`. The audit branch adds documentation only; the target commit is the code baseline.
**Decision:** **NO-GO for mainnet** pending independent contract/circuit audit and sign-off.

## Test evidence
The operator reported `390 passing (3m)` from the full Hardhat test suite after pulling the target commit. This is **operator-reported evidence**, not an independently captured CI artifact. Capture the test command, environment, output, and dependencies in a signed/reproducible audit record. Do not infer formal security certification from test success.

## Contract scope and trust boundaries
- `EchoSmartAccountV4.sol`: authorized execution, nonce increment, protected-target denylist, external call, disabled legacy administration, `executionLock`.
- `EchoSmartAccountV4Bootstrapped.sol`: initial self-delegated policies and signer/bootstrap setup.
- `EchoSmartAccountV4DelegationCandidate.sol`: proof-authorized delegatee and geographic policy changes, `delegationLock`.
- `EchoAuthorizationBridgeV4.sol`: account caller binding, delegatee permissions, checkpoint/transaction/chain binding, signature/dual-proof validation, checkpoint/nullifier consumption.
- `EchoAttestationRegistryV3.sol`, `EchoGeographicPolicyRegistryV4.sol`, geographic gateway, dual verifier, V3/V4 circuits and proving artifacts: inspect exact deployed bytecode and verifying keys.
- Review target/owner/validator/entrypoint trust assumptions, registry mutability, deployment scripts and account factory if deployed.

## Priority findings for auditors to investigate
1. **Cross-function reentrancy (open):** `executeAuthorized` uses `executionLock`; proof-admin functions use separate `delegationLock`. Analyze callback paths where `owner` is a smart contract and can call back into proof-admin while execution is in progress. Include malicious external dependency behavior and correct nonce/proof sequencing. Existing tests of same-function reentrancy do not establish cross-function safety.
2. **Protected target indirect routing (open):** `executeAuthorized` denies direct calls to account/bridge/registries/verifiers/gateway, but an allowed intermediary contract may forward calls. Assess whether downstream permissions and account-scoped checks sufficiently prevent abuse.
3. **Global nullifier mapping:** `consumedNullifiers[nullifier]` is global, not keyed by account. Confirm circuit domain separation and whether cross-account collisions could cause denial of service.
4. **Bridge delegatee management:** `setAuthorizedDelegatee` is callable by any `msg.sender` but only updates that caller's namespace. Confirm all execution paths only accept permission changes issued by the account itself and no alternate account implementation bypasses intended proof policy.
5. **Nonce, checkpoint expiry and revocation:** review cross-domain replay, race/order between revocation and execution, validator rotation and timestamp bounds.
6. **Value/token movement:** identify any arbitrary-call/asset movement paths, allowances, ERC-20 callbacks and unstated spend limits. Tests must prove intended policy rather than merely valid cryptographic authorization.
7. **Circuit-to-contract consistency:** compare V3/V4 public signal indices, field encoding, checkpoint/zone hash, trusted setup artifacts, proving/verifying keys and compiled verifier bytecode.
8. **Operational configuration:** owner and Safe signer threshold, entryPoint trust, recovery policy, deployer privileges, monitoring, emergency response and key compromise procedures.

## Evidence to collect (do not publish secrets)
- Exact `git rev-parse HEAD`, `git status --porcelain`, Node/npm/Hardhat/Solidity versions, lockfile digest.
- `npx hardhat clean && npx hardhat compile && npx hardhat test` full output.
- Scope inventory and SHA-256 of audited sources, compiled artifacts, circuits, verification keys.
- Network, verified addresses, deployment transaction hashes, constructor arguments, bytecode hashes, owner/Safe policy and validator allowlist.
- Threat model, issue tracker with severity/reproduction/fix/test and independent audit report.
- **Exclude** .env, private keys, recovery phrases, raw credentials, and private proving material from any public handoff.

## Acceptance gates
- All critical/high issues resolved or formally risk-accepted by an accountable security authority (critical issues should not be waived for deployment).
- All security changes independently reviewed and tested on a *new* pinned release commit.
- Amoy end-to-end rehearsal and deployment reproducibility verified.
- Explicit authorized deployment decision after independent audit. Until then: **NO-GO**.

## Auditor reproduction
```bash
git fetch origin
git checkout 18fedbdd33e0ed365a34fda260775ac6f9c66fb4
npm ci
npx hardhat clean
npx hardhat compile
npx hardhat test
```
Run in an isolated environment. Do not execute unknown deployment scripts or supply mainnet credentials.
