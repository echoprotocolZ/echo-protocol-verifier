# Echo Protocol Z — Proof-only V4 bootstrap specification

Status: DESIGN SPECIFICATION — no executable bootstrap permission is enabled.

## Decision

Proof-only authorization is selected. An EOA/owner signature MUST NOT
independently authorize bridge registration, trusted signer changes, or
attestation policy changes. Existing locked administration remains locked.

## Independent authorization root

A dedicated bootstrap circuit and verifier must operate without calling the
bridge being registered or consuming a checkpoint through that bridge. The
circuit must verify a cryptographic authorization witness bound to a trusted
root or commitment established independently of the account's uninitialized
V3 registry state. Merely proving knowledge of an arbitrary witness is NOT
authorization.

**Open prerequisite:** The trusted root's enrollment, revocation, ownership,
and recovery model must be specified and reviewed before implementing any
state-changing account entrypoint. Do not hard-code a developer-owned key or
let the proof submitter choose the trusted root.

## Public statement

Each proof must bind these public values (or an unambiguous domain-separated
commitment to them):

- version/domain: ECHO_V4_BOOTSTRAP_PROOF_V1
- chain ID, account, immutable V3 registry address
- operation type: validator signer, hardware signer, policy, bridge
- exact operation arguments or canonical hash thereof
- dedicated bootstrap nonce and deadline
- trusted-root identifier/commitment and proof nullifier

For policies, hash the exact canonical tuple:
`abi.encode(zoneHash, maxTimeDrift, requiredTier, allowValidatorFallback, enabled)`.
For signer operations bind signer, signer kind, and trust decision.
For bridge operations bind bridge and authorization decision.
The verifier must reject noncanonical encodings, mismatched public inputs,
expired intents, revoked roots, and already-consumed nullifiers.

## Execution sequence

1. Account checks registry identity, chain, action, deadline, expected nonce,
   and action-specific validity.
2. Account checks dedicated verifier contract and the independently enrolled
   trusted root; it does not accept caller-supplied verifier/root selection.
3. Account checks the proof over exact public inputs.
4. Account marks bootstrap nonce/nullifier consumed.
5. Account invokes exactly one allowlisted V3 registry setter using its own
   address as msg.sender.
6. A revert anywhere rolls back all account and registry state.

A separate nonreentrancy guard covers the entire sequence. Normal
`executeAuthorized` remains unable to target the V3 registry. Existing
`executeAdministration`, geographic administration, ownership and entry
point mutators remain disabled.

## Recovery and revocation

Bootstrap must not be a permanent uncontrolled admin capability. Specify
bounded lifecycle, root rotation/revocation, compromised-root recovery,
bridge revocation, and trusted signer revocation before implementation.
Recovery must not fall back to an unreviewed owner-only bypass.

## Proof acceptance criteria

- Reproducible circuit source, constraint tests, proving/verifying key
  provenance, and a real Groth16 proof fixture.
- Positive tests on a fresh local account with genuine proof verification.
- Negative tests for forged root, forged witness, cross-chain/account
  replay, wrong action/arguments/nonce/deadline/nullifier, and reentrancy.
- Atomic rollback tests on registry failure and verifier failure.
- Independent audit before any live deployment.

## Explicit nonclaims

Existing V3/V4 proof execution tests and typed intent previews do not
establish this bootstrap proof path. This specification does not add a
working verifier, modify deployed contracts, or authorize mainnet use.
