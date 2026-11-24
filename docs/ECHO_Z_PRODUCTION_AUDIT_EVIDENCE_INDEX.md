# Echo Protocol Z — production audit evidence index

2026-11-24 | Draft PR #8 | Audit preparation only; production release NO-GO pending gates.

## Evidence index

- `ECHO_Z_CANONICAL_TOKEN_DECISION.md`: original Polygon 137 token 0x9511Ee84398B8Deb725d8967c16693C96C43e0eD; reported 100M supply, 18 decimals, symbol Echo, no owner interface. Duplicate 0x5C2933c98a871F14329E028e22AE39Eb7A70A6Cc excluded and untouched. Exact token runtime reproduction and pinned-block custody reconciliation outstanding.
- `ECHO_STAKING_PRODUCTION_SOURCE_REVIEW.md`: preliminary source review. Staking address 0x11bddDCE9770687675Afdef5AA9F001fcC837E4B. User subsequently reported exact runtime comparison PASS; raw comparison evidence not independently captured. Source slashing credits rewardPool rather than burning, compatible in principle with original non-burnable token. No automatic production approval.
- `ECHO_Z_LOCAL_RELEASE_VALIDATION_2026-11-24.md`: reported 801 passing local baseline, reconstructed V2 setup and historical proof fixture limitations.
- `ECHO_Z_HISTORICAL_PROOF_VALIDATION.md`: reported targeted strengthened regression pass; historical signer authorization and isolated account mismatch remain open.
- `ECHO_Z_ALLOCATION_RECONCILIATION_AND_VESTING_GATES.md`: approved working allocation and 48-month founder schedule; no distribution authorized.
- Independently inspected GitHub Actions run 603 (45502094966), commit 9ec54aa64683ad3fbd318c77a186cdc41441349e: 742 passing artifact-independent tests, V4 circuit and security jobs successful; two artifact-dependent jobs skipped.

## Auditor scope and release blockers

1. Pin candidate commit, dependencies, compiler settings, proving artifacts and public verification keys; reproduce complete suite and retain raw logs. Never include private witness or signing secrets.
2. Obtain pinned-block runtime, token binding and privilege inventory for production token, staking, registry, paymaster and delegation proxy. Verify exact bytecode and deployment provenance independently; record unknowns rather than assume verified source implies equivalence.
3. Assess staking owner/registry/oracle compromise, evidence-free slash paths, incident scope, pause/withdrawal, quarantine, lock renewal, solvency and approved staking target integration. Resolve privileged policy decisions before release.
4. Verify Amoy historical signer authorization and production proof setup provenance, account/chain/domain binding, replay and rollback, geographic attestation trust assumptions. Physics constraints alone do not authenticate physical location.
5. Verify Safe custody and actual balances at a named block; reconcile proposed allocations, vesting terms and reward budgets. Local fixtures are not production contracts.
6. Independent audit, remediation review and explicit production authorization required. No claim of unhackability, guaranteed rewards or revenue.

No deployment, merge, token movement or production configuration change authorized by this index.
