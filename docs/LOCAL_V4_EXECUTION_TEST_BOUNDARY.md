# Local V4 execution and bridge-registration integration boundary

Run only against Hardhat's in-memory network:

```bash
npx hardhat test test/echo-v4-local-proof-execution-registration-boundary.js --network hardhat
```

This suite uses `EchoLocalExecutionBridgeMock`. Its `approve` flag is a test fixture, **not a real ZK proof**. It checks target execution, nonce increments, rollback on failure, caller gating, and the account-specific V3 bridge-registration boundary.

**Expected integration blocker:** `EchoAttestationRegistryV3.setCheckpointBridge` registers `msg.sender` as the account. Calling it from an EOA does not register the smart account. The account's `executeAdministration` currently reverts `Unauthorized()`, so there is no enabled pathway for the account to register its V4 bridge. Do not bypass this by impersonating the account in a production-readiness test.

Next required milestone: implement and review a proof-bound, scoped account registration mechanism; test actual `EchoAuthorizationBridgeV4` and registry with authentic generated V3/V4 proof fixtures and verified circuit/key provenance. Only then claim proof-authorized execution. No mainnet deployment, no live POL spending.

These new tests were committed through GitHub but **have not been executed by this assistant**. A successful commit is not a passing test result.
