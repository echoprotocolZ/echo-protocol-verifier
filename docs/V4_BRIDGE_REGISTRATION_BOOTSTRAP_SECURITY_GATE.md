# V4 bridge registration: bootstrap security gate (design only)

Status: **BLOCKED — no production implementation approved by evidence**.

## Verified code-level circular dependency

1. `EchoAttestationRegistryV3.setCheckpointBridge(bridge, authorized)` stores the authorization under `msg.sender`.
2. An EOA calling it authorizes only the EOA, not the deployed smart account.
3. `EchoSmartAccountV4.executeAdministration` unconditionally reverts `Unauthorized()`.
4. `EchoSmartAccountV4.executeAuthorized` excludes the checkpoint registry from allowed execution targets.
5. `EchoAuthorizationBridgeV4.authorize` calls `consumeCheckpointFromBridge`, which requires the bridge already to be registered for the account.

Therefore **ordinary proof-authorized execution cannot bootstrap the registration it depends upon**. Do not bypass this by impersonation, owner-only administration, generic target-call permissions, or by trusting a mock proof.

## Candidate design requiring security review

Introduce a separate, narrowly scoped bootstrap registration authorization with a domain-separated intent bound to:
- account address, target registry address, exact bridge address, operation (register or revoke), chain ID, nonce, deadline;
- authenticated account authority (not merely a caller-supplied account address);
- a verified proof/signature path **independent of the registry authorization being bootstrapped**;
- a one-time nonce or nullifier consumed atomically with the registry update.

Registration must be invoked by the account itself; the registry should preserve its `msg.sender` account isolation. Revocation and re-registration must have explicit recovery and replay rules. If the bootstrap proof path cannot be independently authenticated, remain blocked.

## Required tests before implementation is considered safe

- Forged account, wrong chain, wrong registry, wrong bridge, wrong operation, expired deadline and wrong nonce reject.
- Replay across accounts, chains and registrations rejects.
- An EOA cannot register on behalf of an account.
- Reverting registry update rolls back nonce/nullifier and any authorization state.
- Unauthorized administration and arbitrary calls remain disabled.
- Real proof fixtures, circuit/key provenance, and authentic rollback anchors are checked independently.
- Atomic fencing covers authorization, registry update and failure recovery.
- Run tests on Hardhat first; Amoy only after approval and independent review.

No mainnet deployment, live token movement, or publication is authorized by this document.


## Bootstrap dependency review — next implementation boundary

The registry's account-scoped `setCheckpointBridge`, `setValidatorSigner`,
`setHardwareSigner`, and `setAttestationPolicy` all require a call
**originating from the account**. A bridge-registration mechanism alone will
not initialize signer and policy state. Even after bridge registration, an
uninitialized account cannot consume a checkpoint via the V3 registry.

### Required implementation sequence

1. Establish an independent, authenticated **bootstrap authority** whose
   verifier and trust root do not depend on a checkpoint already consumed
   through the V3 registry.
2. Bind each permitted operation to the exact account, chain, destination,
   parameters, nonce, deadline, and operation type.
3. Permit only narrowly typed bootstrap actions for validator signer,
   attestation policy, and bridge registration; do not expose arbitrary
   target calls or unlock legacy `executeAdministration`.
4. Define revocation and recovery separately, with explicit proof-of-control
   and replay rules.
5. Prove full atomic rollback and replay rejection with real verification
   fixtures before considering a deployable replacement account.

**Unresolved architectural choice:** The project has not established an
independent bootstrap trust root or verified circuit for these exact intents.
An owner ECDSA signature alone would be a different security model from the
specified proof-bound administration. Until that choice is reviewed and
approved, implementation must remain non-executable.

### CI checkpoint

The user reported that the workflow including the registry-target execution
guardrail passed. This is user-reported CI evidence, not independently fetched
job logs, and does not demonstrate genuine Groth16 verification.
