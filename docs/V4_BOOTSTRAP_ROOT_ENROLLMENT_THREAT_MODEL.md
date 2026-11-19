# Echo Protocol Z — V4 bootstrap root enrollment threat model (proposal)

Status: DESIGN PROPOSAL / NOT APPROVED / NO CONTRACT PERMISSIONS ENABLED.

## Current verified boundary
The experimental Circom bootstrap proof demonstrates knowledge of a secret opening a Poseidon enrollment root and binds an action hash, account, chain ID, nonce and nullifier. Ephemeral local Groth16 verification is a cryptographic test, **not** evidence that the root is authorized. EchoSmartAccountV4 still reverts on administrative functions.

## Critical trust-origin problem
An attacker who can supply their own root can prove knowledge of their own secret. A contract that accepts a proof-supplied root, or permits the owner to set one without a separately reviewed authorization ceremony, fails the proof-only objective. No state-changing bootstrap method may be added until root provenance is settled.

## Candidate architecture for review (not implementation)
1. A separately audited enrollment authority commits a root **before** account bootstrap. The account constructor or a CREATE2 deployment commitment immutably binds the enrollment authority and expected root commitment, including chain ID and account identity. Do not assume the current deployed account has these fields.
2. The root must be independently verified against the authority's on-chain state; the proof submitter cannot choose the authority, root or verifier.
3. A dedicated, immutable verifier checks the Groth16 proof against a canonical statement that binds version, chain ID, account, immutable registry, exact operation selector and arguments, deadline, bootstrap nonce, and nullifier.
4. One proof permits exactly one allowlisted registry setter. Consuming nonce/nullifier and calling the setter must be atomic and reentrancy guarded. The generic executeAuthorized path must continue to reject registry targets.
5. Enrollment and recovery must be explicit: define who can enroll, how authority compromise is detected, how a root is revoked, how recovery avoids a single-key admin bypass, and whether bootstrap is permanently closed after initialization.

## Design questions requiring explicit approval
- Who authorizes the **first** enrollment root, without relying on the registry that has not been initialized?
- What is the independent trust anchor: immutable deployment commitment, audited external registry, or another mechanism?
- How can a compromised root be revoked before it is used? Who may recover after revocation?
- How is CREATE2 address binding achieved without a circular dependency?
- Is the root single-use, operation-scoped, time-limited, or rotatable?
- How will the proving/verifying key ceremony and verifier bytecode be audited and reproduced?

## Local-only acceptance gates
- Attacker-chosen root fails despite a mathematically valid Groth16 proof.
- Root substitution, cross-account and cross-chain replay, wrong registry/action/arguments, expired deadline, repeated nonce/nullifier, and verifier substitution fail.
- Failed registry calls revert proof consumption and all state.
- Existing locked owner/admin/entrypoint methods remain inaccessible.
- No mainnet deployment, funds movement, or permissions granted.

This document intentionally makes **no claim** of an implemented or secure enrollment mechanism.
