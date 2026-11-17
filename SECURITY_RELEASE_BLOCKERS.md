# Echo Protocol Z — Release Blockers (2026-11-12)

## Verified baseline
- User-confirmed Hardhat full suite: **365 passing, 0 failing** (~2 min).
- Genuine V3/V4 Groth16 proof-to-execution integration: **11 passing**.
- **Mainnet: NO-GO.** Test coverage is not an audit.

## P0: Real smart-account policy bootstrap is missing
`EchoSmartAccountV4.executeAdministration()` and `executeGeographicAdministration()` unconditionally revert `Unauthorized()`; ownership and entry-point changes also unconditionally revert. Yet `EchoAttestationRegistryV3.setCheckpointBridge`, `setValidatorSigner`, `setAttestationPolicy`, `EchoGeographicPolicyRegistryV4.setGeographicPolicy`, and `EchoAuthorizationBridgeV4.setAuthorizedDelegatee` are callable only by `msg.sender`, the smart account for account-scoped configuration. The real-proof tests use `ethers.getImpersonatedSigner(account.target)` to initialize these settings. **That impersonation is unavailable on Polygon mainnet.** A freshly deployed V4 smart account therefore lacks a demonstrated production method to initialize its required policies and trusted bridge.

**Release acceptance:** implement and threat-model a real proof-authorized bootstrap/admin pathway, or a narrowly scoped immutable/deployment-time bootstrap, without introducing owner-only token-moving bypasses. Verify actual account-origin calls on a public testnet **without impersonation**. Add admin intent binding, nonce/replay, expiry, chain, target/selector allowlists, revocation and rollback tests.

## P0: Fund movement and delegation review
- `EchoSmartAccountV4._performAuthorizedCall` performs arbitrary `target.call{value:value}(data)` after authorization. Verify asset-movement allowlists, bounded approvals and target restrictions in the intended production account variant; avoid unlimited ERC-20 allowances.
- `EchoAuthorizationBridgeV4.setAuthorizedDelegatee` is account-scoped. Verify real deployment configuration and revocation (not merely impersonated setup).
- Test cross-account isolation, delegatee scopes, nonce races and replay on actual deployment path.

## P0: Release engineering
- Pin Solidity, Hardhat, Circom, snarkjs and proving/verifier artifact hashes. Confirm production verifier matches proving keys.
- Test actual deployment scripts on Polygon Amoy; confirm contract addresses, wiring, role ownership, policy initialization and proof execution.
- Commission independent security review and remediate findings before any mainnet asset movement.

## Execution order (avoid endless micro-batches)
1. **Implement production bootstrap/admin design** and prove a new smart account can be configured without impersonation.
2. **One consolidated adversarial integration suite**: account isolation, bounded delegation, concurrency, approval/asset movement, policy revocation, recovery and rollback.
3. **One Amoy deployment rehearsal** with published contract/artifact hashes, followed by independent audit.
4. Decide mainnet GO/NO-GO only against documented acceptance criteria.

## Important
The 365-passing suite confirms tested behaviors, not permissionless deployability, financial safety, ERC-4337/7579 compliance, or production readiness.
