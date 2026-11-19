# Echo V4 bootstrap authorization — implementation decision record

Status: **DESIGN GATE / NOT EXECUTABLE**

## Current proven boundary

The account's normal authorization path depends on a bridge that the V3 registry
must already trust. The V3 registry also scopes signer and policy updates to
`msg.sender`, so an EOA cannot initialize those settings for a smart account.
Read-only typed intents are present; they are not authentication.

## Trust root required before writing a state-changing entrypoint

A verifier independent of `EchoAuthorizationBridgeV4.authorize` and
`EchoAttestationRegistryV3.consumeCheckpointFromBridge` must authenticate
the exact bootstrap intent. This verifier must be deployed and its trust
assumptions reviewed before account construction. The project has **not**
yet established which of the following is acceptable:

- **Proof-only:** a dedicated circuit and on-chain verifier that binds a
  bootstrap authorization commitment to the operation, account, registry,
  chain, nonce and expiry. Requires trusted setup/key provenance and proof
  fixtures. An unauthenticated proof of arbitrary public inputs is insufficient.
- **Explicit owner-signature bootstrap:** EIP-712 signed typed intent verified
  against an immutable account authority, potentially with ERC-1271 support.
  This is *not* proof-only administration and must be treated as a security
  model change requiring explicit approval and separate audit.

Do **not** silently choose the owner-signature path just because it is easier
to implement. Do not reuse an ordinary execution checkpoint as bootstrap
authentication.

## Narrow execution design, after trust root approval

1. A separate bootstrap entrypoint accepts a typed action, encoded arguments,
   nonce, deadline and authenticator. It must not accept arbitrary target/data.
2. Validate domain/chain/account/registry, action-specific parameter checks,
   expiry, replay state, and the independent authenticator.
3. Restrict destination to the registry bound at account construction; invoke
   only the allowlisted V3 functions for validator signer, hardware signer,
   policy, and checkpoint bridge.
4. Consume a dedicated bootstrap nonce atomically with the registry call;
   reverts must roll back both. Keep ordinary execution nonce separate unless
   an audited specification explicitly requires sharing it.
5. Use a non-reentrant lock across authentication and registry update; reject
   callback attempts and cross-operation replay.
6. Include an explicit terminal bootstrap state or a separately reviewed
   recovery/revocation path. A one-time bootstrap that cannot revoke a
   compromised signer is also unsafe.
7. Maintain `executeAdministration`, `executeGeographicAdministration`,
   ownership and entry-point setters in their existing locked state.

## Required tests

- Valid independently authenticated request initializes only the intended
  account's registry state; invalid proof/signature fails.
- Wrong account, registry, bridge, signer, policy hash, chain, nonce, action,
  deadline, and replay fail.
- Different action types cannot substitute for one another.
- Reentrant callbacks, failed registry writes and invalid configurations
  roll back nonce and all state.
- No EOA can initialize another account; normal executeAuthorized cannot
  call the registry; legacy admin stays locked.
- End-to-end proof fixture verification must use the real verifier and
  documented proving-key provenance, not EchoLocalExecutionBridgeMock.

## Deployment boundary

Changing Solidity source does not change already deployed smart accounts.
Any executable solution will require a reviewed replacement deployment plan.
No mainnet deployment, token movement, or public launch is authorized.
