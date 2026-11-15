# Echo Protocol Z — Implementation inventory and next build boundary (2026-11-14)

This inventory distinguishes repository implementation, test evidence, public-testnet evidence, and unimplemented protocol proposals. It does not assert audit or production readiness.

## Verified in repository
- `EchoAuthorizationBridgeV4`, `EchoDualProofVerifierV4`, geographic gateway/policy and V3 attestation registry: dual-proof authorization, checkpoint validation, transaction binding and replay controls.
- `EchoSmartAccountV4Bootstrapped`: constructor-time self-delegated policy bootstrap, addressing the **original V4** no-impersonation bootstrap blocker for this specific deployment variant. This does not automatically resolve all administration or recovery needs.
- `EchoAccountFactoryZ` and `EchoSmartAccountZ`: CREATE2 account creation with owner-signed deployment configuration, factory-controlled initialization, and proof-bound administrative entrypoints.
- `EchoAgentPolicyRegistryZ`: account-scoped agent expiry, target/selector allowlists, value and token approval limits.
- `EchoSmartAccountZ`: monitored token budgets, approved staking target binding, atomic staking approval/cleanup and balance-based accounting.
- `test/echo-z-real-proof-staking-integration.js`: local Hardhat integration covering fresh dual proofs, account setup, 1,000 mock ECHO stake, allowance reset, budget accounting, nonce and nullifier/replay checks. These are local fixtures, not proof of production staking safety.

## Public Amoy evidence reported in Codespaces
- Bootstrapped account `0xBbb493289FE2698D04a9EC05Fe9Dd1d400Bc418f` has self-delegated geographic and attestation policies, trusted validator, approved bridge, nonce 0.
- Fresh self-delegated V3/V4 proof and checkpoint signature verified, and `executeAuthorized.staticCall()` passed with `0x` return. **Read-only simulation**: no transaction receipt or nonce consumption established.

## Not established
- Independent security audit, mainnet release readiness, production staking integration with reviewed on-chain ECHO contracts, ERC-4337/7579 standards compliance.
- End-to-end decentralized shard routing, transport-node discovery, K-of-N reconstruction, routing incentives/slashing, hardware-backed physical location/time attestations or VDF enforcement. A Circom fragment verifier and architectural designs are not a deployed routing network.
- Broad policy recovery/upgrade paths and safe cross-chain messaging; do not infer these from local tests.

## Next implementation milestone: routing MVP boundary
1. Write a precise threat model for a **test-only off-chain fragment transport**: adversary controls some relay nodes, can delay/drop/reorder packets; no claims of impossible interception or physical-location security.
2. Define a versioned packet manifest: payload commitment, fragment index/count, threshold, expiry, destination binding, chain/account binding and checkpoint commitment. Define what is public metadata.
3. Implement a local simulator and deterministic tests for fragmentation/reconstruction, tampering, missing fragments, replay, expiry and checkpoint mismatch **without tokens, mainnet, or external relay nodes**.
4. Define an on-chain verification interface only after the simulator's security invariants are documented. Avoid changing deployed V4/Z authorization contracts to fit a premature routing design.
5. Independently review cryptographic assumptions, privacy leakage and denial-of-service properties before network deployment.

## Release discipline
Keep mainnet NO-GO pending an independent audit and specific deployment acceptance criteria. Do not interpret passing tests as proof of physical location, time or transport secrecy.
