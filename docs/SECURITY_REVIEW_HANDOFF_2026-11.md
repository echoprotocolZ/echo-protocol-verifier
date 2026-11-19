# Echo Protocol Z — Independent Security Review Handoff

**Status:** Pre-audit evidence package; NOT an audit or production approval.  
**Scope reference:** `security/nonce1-authorization-preflight-2026-11`, commit `cb802caafef7dd5b928c3ec8de30c8d356d45087` (2026-11-19).  
**Execution policy:** Local Hardhat tests only. No mainnet deployment, token transfers, live Safe transactions, or contract upgrades.

## Proposed review scope

Priority bootstrap path:
- `contracts/EchoBootstrapSafeApprovedFactoryV1.sol`
- `contracts/EchoBootstrapProofGateV1.sol`
- `contracts/EchoBootstrapBridgeExecutorV1.sol`
- `test/echo-v4-bootstrap-real-safe.js`
- `test/echo-v4-bootstrap-safe-approved-factory.js`

Adjacent authorization boundaries requiring independent scoping:
- `contracts/EchoSmartAccountV4.sol`
- `contracts/EchoAuthorizationBridgeV4.sol`
- `contracts/EchoAttestationRegistryV3.sol`
- Their dependent verifiers, circuits, and registration/execution tests (reviewer to determine complete dependency closure).

**Not automatically in scope:** Token economics, token deployment, staking, frontend, network routing claims, other deployed contracts, or claims about end-to-end geographic truth.

## CI evidence (successful on the scope reference commit)

- [V4 Security Regression](https://github.com/echoprotocolZ/echo-protocol-verifier/actions/runs/44507403849)
- [Echo V4 local-only security regression](https://github.com/echoprotocolZ/echo-protocol-verifier/actions/runs/44507403828)

CI success demonstrates these tests completed successfully; it does **not** establish absence of vulnerabilities, independent bytecode equivalence, or live-system safety.

## Tested Safe boundaries

The official Safe local integration test covers 2-of-2 signatures, single/non-owner/duplicate/empty signatures, changed root/salt/verifier, owner replacement, threshold downgrade, duplicate deployment, different Safe instances, and approvals signed for a different chain ID.

**Important qualification:** Owner replacement and threshold changes are simulated using Hardhat Safe-address impersonation for the Safe's self-call. This does **not** validate the signature authorization of `Safe.execTransaction` for those state transitions.

## Design and review questions

1. Independently verify the approved Safe's implementation, proxy, fallback handler, owners, threshold, address and code provenance. The bootstrap factory checks the current owner set and threshold but does not by itself establish genuine Safe implementation provenance.
2. Review EIP-1271 handling, Safe signature encoding, EIP-712/EIP-191 interactions, and domain separation across chain, Safe, factory, and configuration.
3. Verify one-shot deployment state transitions, CREATE/CREATE2 address predictions, constructor side effects, and rollback/reentrancy behavior.
4. Confirm proof-gate and executor authorization, checkpoint binding, nonce/nullifier consumption, replay resistance, and all reachable token-moving paths.
5. Verify production deployed runtime bytecode independently against reviewed source and compiler settings. Source verification alone is insufficient.
6. Establish explicit trust assumptions for geographic proofs, timestamps, validators, relayers, hardware claims, and off-chain data.

## Known limitations / blockers

- No independent audit finding or sign-off is represented by this package.
- Official Safe integration is a local simulation, not proof of live Safe deployment provenance.
- Source-to-deployed-runtime bytecode equivalence is not established for all previously deployed contracts.
- Full live end-to-end bridge registration and proof execution, including all dependency and external trust assumptions, is not established by the bootstrap tests.
- Security coverage is incomplete; additional fuzzing, invariant testing, threat modeling, and independent manual review are recommended.
- This branch is not authorized for mainnet deployment or merging merely because CI is green.

## Requested audit deliverables

Threat model and trust-boundary diagram; complete contract/dependency scope; severity-ranked findings with reproductions; remediation review; test and fuzzing recommendations; reproducible compiler/build provenance; explicit unresolved risks; and a final independent report.

## Reviewer reproduction

Check out the pinned commit, inspect workflow definitions for exact Node/dependency versions and commands, and reproduce the local-only CI jobs in an isolated environment. Do not use funded wallets or production RPC credentials.
