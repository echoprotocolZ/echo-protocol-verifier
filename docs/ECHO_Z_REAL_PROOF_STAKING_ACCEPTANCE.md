# EchoSmartAccountZ real-proof staking — execution plan and acceptance criteria

Status: **NOT YET VERIFIED**. The 291 passing Hardhat tests reported on 2026-11-11 cover prior suites including proof-free rejection. They do not establish a successful staking transaction through the Z account with genuine V3/V4 proofs.

## Source-reviewed dependencies

- `EchoSmartAccountZ.executeProofAuthorizedSpendingBudgetUpdate` sets the monitored token and cumulative budget via a proof-authorized self-call.
- `EchoSmartAccountZ.executeProofAuthorizedStakingTargetUpdate` binds a reviewed staking target via a separate proof-authorized self-call.
- `EchoAccountFactoryZ.setStakingCodehashApproval` and `setStakingTargetApproval` require the staking code authority; codehash alone is insufficient.
- `EchoSmartAccountZ.executeAuthorized` validates execution policy, authorizes through V4 bridge, increments nonce, performs the atomic stake, and records monitored-token outflow.
- `EchoStakingSourceFixture` mirrors user-supplied source for local tests; its runtime code has **not** been independently matched to deployed Polygon code.
- `test/echo-v4-real-dual-proof-integration.js` already generates real V3/V4 Groth16 proofs for a V4 bootstrapped account and a `TestTarget`. Reuse its Poseidon, checkpoint, signature, proof and public signal generation; do not reuse its target/account-specific proofs.

## Mandatory positive test sequence

1. Deploy actual V3/V4 verifiers, registries, bridges, geographic gateway, Z agent registry, Z factory, test ECHO, and production-source staking fixture.
2. Use factory EIP-712 owner signature to create and initialize `EchoSmartAccountZ`, with the same zone and authorized delegatee used in proof generation.
3. Explicitly approve the staking fixture's runtime codehash **and** target/token binding through the factory authority.
4. Generate fresh V3/V4 proofs bound to **nonce 0**, account address, `address(this)` target, and the exact calldata `setTokenSpendingBudget(agent, token, 1000 ether)`; execute `executeProofAuthorizedSpendingBudgetUpdate`. Verify nonce 1 and budget state.
5. Generate fresh V3/V4 proofs bound to **nonce 1**, account address, `address(this)` target, and `setTrustedStakingTarget(agent, staking)`; execute `executeProofAuthorizedStakingTargetUpdate`. Verify nonce 2 and target binding.
6. Transfer 1000 ECHO to the Z account. Generate fresh V3/V4 proofs bound to **nonce 2**, staking target, zero ETH value, and `stake(1000 ether)` calldata; execute `executeAuthorized`.
7. Verify nonce 3, validator stake 1000 ECHO at **the Z account address**, `totalStaked=1000 ether`, token balance of staking 1000 ECHO, Z token balance 0, token allowance from Z to staking 0, and `tokenSpendingUsed(agent, token)=1000 ether`.
8. Verify replay of each consumed proof fails; tampered calldata/target, wrong chain, invalid validator signature, expired timestamp, and altered public signals all fail without changing stake, balances, allowances, budget or nonce.
9. Test a second stake with fresh proof fails if cumulative budget would be exceeded, and that all token/nonce/nullifier/checkpoint state is rolled back.
10. Run the targeted test and the complete Hardhat suite, capturing both output and commit hash.

## Important engineering constraints

- **Three distinct real-proof transactions** are required: budget update, target update, stake. A single valid proof for `TestTarget.setValue` cannot authorize these.
- Every proof must bind the exact transaction target, calldata hash, nonce, chain ID, account, delegatee, checkpoint, deadline and V3/V4 shared checkpoint commitment.
- Use fresh block timestamps and witness values; do not transplant the preexisting `echo-v4-real-dual-proof-integration.js` proof unchanged.
- The Z account's execution policy is fail-closed unless the monitored token and reviewed staking target are already configured.
- Keep source-fixture and production bytecode verification separate. Passing this integration test would **not** constitute an audit or mainnet release authorization.
