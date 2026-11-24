# Echo Protocol Z — local release validation, 2026-11-24

Status: user-reported local full suite 801 passing (3m), no failures reported. Not independently reproduced in CI; not release approval.

## Environment and recovery
- Detached validation worktree based on 4f02bd1e4e849eb648bcc7f67b9d8fe490096651 (terminal displayed 4f02bd1). Original workspace preserved.
- 89 Solidity files compiled, Cancun target. Initial full suite: 776 passing, nine missing-prerequisite failures.
- Existing V3/V4/V2 circuit artifacts and production staking compiler output copied locally. No new production proving keys.
- Official Safe test dependency installed using existing CI command: `npm install --no-save --package-lock=false --legacy-peer-deps @safe-global/safe-contracts@1.4.1`.
- V2 local-setup reconstructed from existing standard V2 final zkey, verification key and proof/public signals; exported Solidity verifier and compiled locally. Both targeted V2 tests reported passing. This does not establish historical local-setup key identity or deployed verifier bytecode equivalence.
- Cross-account regression locally changed fixture prefix from fresh-1794741142-nonce-1 to fresh-1794738331-nonce-1. User confirmed both Groth16 verifications, matching commitments and nonce 1. Final full suite reported 801 passing.

## Outstanding gates
- Capture exact local diff, full log and digest, dependency and artifact hashes; independently reproduce on reviewed commit.
- Verify historical checkpoint signature and proof-to-checkpoint bindings; require exact InvalidDelegationIntent revert rather than accepting errors without revert data. Keep original negative regression semantics.
- Establish artifact provenance and production verifier equivalence; no private witness data or signing secrets in repository.
- Production staking exact runtime match previously reported by user; retain full evidence and independently verify.
- Canonical fixed-supply original token retained; duplicate excluded and untouched. See canonical token decision record.
- Independent security audit, production custody and allocation gates, explicit release authorization remain outstanding.

No merge, deployment, token movement or production authorization is implied by this record. Passing tests do not establish invulnerability.
