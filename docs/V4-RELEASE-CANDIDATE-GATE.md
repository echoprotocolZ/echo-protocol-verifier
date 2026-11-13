# Echo Protocol Z — V4 Release Candidate Gate

Status: **NOT APPROVED FOR MAINNET**. This document is a release checklist, not an audit or certification.

## Scope
Experimental `EchoSmartAccountV4DelegationCandidate` and its V3/V4 authorization dependencies. Existing Amoy deployment is not upgraded by these changes.

## Evidence already reported
- Full Hardhat suite: **389 passing (3m)**, user-reported before protected-target test.
- Protected-target-boundaries test: user-reported passing separately.
- Full suite must be rerun on the final commit; previous results are not a substitute.

## Required release commands
```bash
git status --short
npx hardhat clean
npx hardhat compile
npx hardhat test
```
Record branch, commit SHA, compiler, dependency lockfile, and complete test output. Do not deploy if any test fails.

## Security review blockers
- [ ] Cross-function reentrancy review: execution callback into proof-authorized delegation and geographic administration; distinguish inaccessible owner-only functions from owner-as-contract scenarios.
- [ ] Review authorization boundaries for *indirect* calls through permitted target contracts, including target-controlled proxy/forwarder behavior.
- [ ] Review proof replay/nullifier scoping across accounts and chains, checkpoint expiry and validator trust changes.
- [ ] Review geographic policy changes between proof generation and execution, and revocation ordering.
- [ ] Review gas griefing, denial of service, unexpected ERC-20 callbacks, external contract failures and atomic rollback.
- [ ] Confirm threat model, trusted roles, emergency response, and key custody / Safe threshold.
- [ ] Confirm test-only contracts are excluded from deployment scripts and deployment allowlist.
- [ ] Independent Solidity + ZK circuit audit; fix all critical/high findings and rerun full suite.
- [ ] Verify production addresses, constructor args, chain ID, bytecode, ownership, admin policies, and signer configuration on intended network.
- [ ] Stage on Amoy with end-to-end proof generation, funding, execution, revocation, and monitoring.

## Release decision
**NO-GO** until all blockers are resolved with recorded evidence and explicit deployment approval. Never deploy or transfer funds based on this checklist alone.
