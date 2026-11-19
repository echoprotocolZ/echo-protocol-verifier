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
