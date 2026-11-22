# V4 bridge registration: proof-bound bootstrap acceptance criteria

Status: **design gate only — NOT implemented or approved for deployment**.

## Confirmed source-level blocker
`EchoAttestationRegistryV3.setCheckpointBridge(bridge, authorized)` writes to `authorizedCheckpointBridges[msg.sender][bridge]`. A direct EOA call cannot configure the V4 smart account. `EchoSmartAccountV4.executeAdministration` unconditionally reverts `Unauthorized()`; `bridgeRegistrationIntent` only returns encoded bytes. The currently deployed V4 account cannot be retrofitted in place.

## Required independent bootstrap authority
The bridge being registered **must not authorize its own registration**. A future, separately reviewed bootstrap verifier must authenticate an explicit registration intent independently of the untrusted candidate bridge. Do not reuse an owner-only call, generic `target.call`, EOA impersonation, a mock that always returns true, or an unbound V3/V4 proof as a production bypass.

The verifier must bind **all** of:
- Domain tag `ECHO_V4_ADMIN_BRIDGE_REGISTRATION_V1`, account address, exact registry address, exact bridge address, authorize/revoke bit
- `block.chainid`, account-specific nonce, nonzero expiry checked against `block.timestamp`
- Verified signer/proof authority whose trust anchor exists *before* the candidate bridge is registered
- Explicit public-input/commitment linkage to the canonical `EchoV4AdminIntent.bridgeRegistrationPayload`; hashing bytes off-chain alone is insufficient
- An allowlisted registry interface and a bridge with code; no arbitrary calldata or arbitrary target execution

## Atomicity and failure behavior
1. Check authentication and freshness before any external state change.
2. Increment/consume the dedicated registration nonce in the same transaction as registry registration; all state must revert if the registry call fails.
3. Register from the **account contract itself**, so `msg.sender` at the registry is the intended account.
4. Prevent reentrancy, proof replay, cross-account/cross-chain/cross-registry substitution, altered bridge address or authorize flag, expired intent, and unauthorized revocation.
5. Preserve existing locks on `executeAdministration`, `executeGeographicAdministration`, ownership and entry-point setters. No generic administration unlock.

## Mandatory local tests before considering implementation complete
- A genuinely authenticated registration succeeds on Hardhat with the actual registry and candidate bridge, and only for the intended account.
- Wrong signer/proof, mutated intent field, missing proof, replayed nonce, expired deadline, wrong chain/account/registry, non-contract bridge, and outsider fail without changing account or registry state.
- Registration failure rolls back nonce and all effects; revocation blocks future bridge checkpoint consumption.
- Real V3/V4 proof fixtures and their verification-key provenance are validated independently; a mock-based green test does **not** count as proof-authorized execution.
- Existing zero-trust regression suites remain green, including locked administration and rollback.

## Engineering decision required
Choose and independently review a trust anchor for **first-time registration** (for example, a separately audited immutable bootstrap verifier with dedicated proof circuits/public inputs). Current V3/V4 execution proofs cannot simply be assumed to authenticate administrative intent. Until this decision and a complete implementation are reviewed, the launch gate remains **BLOCKED**.

No mainnet deployment, no POL spend, no production security claim.
