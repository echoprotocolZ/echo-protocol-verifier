# V4 proof-bound administration: implementation contract (draft)

Status: DESIGN ONLY — not deployed, audited, or enabled. Existing V4 administrative entrypoints remain fail-closed.

## Security invariants

1. No owner-only, entry-point-only, or delegatee-only bypass of proof authorization.
2. The account itself must call the V4 bridge, and the bridge must validate BOTH V3 and V4 proofs, checkpoint signature, trusted validator policy, chain ID, deadline, target, value, calldata hash, and account nonce.
3. An administrative authorization must bind the **exact operation and parameters**. It must never be interchangeable with ordinary external execution.
4. Checkpoint and nullifier consumption and state mutation must be atomic; a revert must undo all.
5. Ownership transfer must be two-step: proof-authorized initiation to a nonzero successor, then explicit acceptance by that successor. The acceptance path must be separately threat-modeled; no unbounded pending-owner authority.
6. Prevent self-calls through the ordinary executeAuthorized path. Introduce a dedicated, narrowly scoped administrative entrypoint rather than weakening the existing target restrictions.
7. Domain separation must include chain ID, smart-account address, operation identifier, arguments, and nonce, with deadline. No generic arbitrary-call administration.
8. Configuration changes to validators, checkpoint bridges, delegatees, geographic policies, and entry point must use individually reviewed permissions and must not silently weaken proof requirements.
9. A recovery process must exist before production; avoid locking assets into an account whose administration is permanently disabled.
10. Keep Safe treasury custody independent of experimental V4 account contracts.

## Implementation order

- Phase A: Define explicit admin operation identifiers and typed argument encodings; review with existing V3 public-signal/circuit constraints. Verify the proof circuit can bind the intended call, not merely the Solidity wrapper.
- Phase B: Add a dedicated V4 proof-authorized ownership initiation path, using the same authenticated bridge consumption logic as executeAuthorized, with strict operation binding.
- Phase C: Implement successor acceptance with independent signature/transaction authentication and clear cancellation/recovery policy. Consider whether acceptance itself needs a proof; document the chosen threat model.
- Phase D: Add narrowly scoped proof-bound policy/entry-point changes, each with its own tests.
- Phase E: Run complete unit/integration tests with REAL proof fixtures and negative tests (wrong chain, target, args, nonce, expired proof, reused nullifier/checkpoint, unauthorized signer, invalid V3, invalid V4, reentrancy, attempted self-call).
- Phase F: Independent audit, deployment rehearsal, verified source and address checks, staged production rollout.

## Existing-code caveats observed

- EchoSmartAccountV4 currently reverts on transferOwnership, acceptOwnership, setEntryPoint, executeAdministration, and executeGeographicAdministration.
- executeAuthorized forbids target == address(this), so it cannot directly be reused for internal administration.
- EchoAuthorizationBridgeV4.authorize binds transaction data through V3 signals and consumes checkpoints and nullifiers.
- EchoAttestationRegistryV3 has account-scoped trusted signers, policies, and approved bridges, but its configuration functions are callable by msg.sender for that caller's account; integration with a smart-account admin path needs explicit design.
- The two-step ownership and fail-closed tests cover disabled behavior, not a working proof-bound ownership transfer.

Do not describe this design document as an implemented feature or a passed security audit.
