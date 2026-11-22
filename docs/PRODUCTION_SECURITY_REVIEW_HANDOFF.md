# Echo Protocol Z — production security review handoff

**Status:** NOT RELEASE-READY. Security branch: `security/v4-zero-trust-hardening`. Latest user-reported Hardhat suite: **267 passing (54s)**. This is not an independent audit.

## Verified repository inventory (11 November 2026)

The `contracts/` directory contains `EchoSmartAccountZ.sol`, `EchoAccountFactoryZ.sol`, `EchoAgentPolicyRegistryZ.sol`, V3/V4 authorization components, `EchoTokenTestMock.sol`, and `EchoStakingTestMock.sol`. **No production `EchoToken.sol` or `EchoStaking.sol` files were found in this directory on this branch.** The staking mock explicitly states **"Local integration testing only. Never deploy to Mainnet."** Do not substitute it for production source review.

The deployed Polygon ECHO token and staking contract must be separately matched to verified on-chain source, compiler settings, constructor parameters, runtime bytecode and proxy implementation slots (if applicable). A passing local test does not establish that deployed contracts match this repository.

## Code-reviewed boundaries requiring external verification

1. `EchoSmartAccountZ._validateExecutionPolicy` allows only monitored-token `transfer(address,uint256)` or registered, approved `stake(uint256)`. `_executeAtomicStake` independently rechecks target and code approval, enforces monitored-token identity and exact balance decrease, and clears temporary allowance.
2. `EchoAccountFactoryZ` requires approved runtime codehash **and** a specifically approved target address with recorded `echoToken()`. The approval authority can still approve arbitrary codehashes/addresses; authorization correctness is not equivalent to implementation safety.
3. `stakingCodeAuthority` is initialized to the factory deployer and can be transferred through nomination/acceptance, with cancellation. **No Safe multisig transition is evidenced by these source files.**
4. Target approval is not a general guarantee against proxies, upgradeable tokens, malicious ERC-20 hooks, compromised approval authority, or pre-existing unrelated token allowances.
5. The real-proof malicious staking fixture tests rejection of an **unapproved** malicious target. It does not establish that a malicious contract deliberately approved by the governance authority is safe.

## Required evidence before Issue #3 closure

- [ ] Obtain verified source/ABI and compiler build metadata for **actual production ECHO token and staking contracts**, including deployed addresses, chain ID and whether either is upgradeable.
- [ ] Confirm token supply, ownership, allowances, staking accounting, withdrawal rights, lock periods, and any emergency/admin pathways from actual deployed code.
- [ ] Record Safe address, network, owner set, signing threshold and transaction execution path. Verify Safe can accept the factory authority through an on-chain Safe transaction; do not assume signer setup alone transfers authority.
- [ ] Define approval/revocation policy: source and bytecode review, constructor and token binding, proxy rejection or implementation pinning, event monitoring and emergency response.
- [ ] Independent audit of account, factory, registry, authorization bridge, verifiers, circuits, staking and token integrations; resolve findings.
- [ ] Run static analysis, reproducible build, full integration suite and deployment simulation against exact production artifacts.

## Safe handoff procedure (not yet executed)

1. Deploy/review the intended factory on a testnet; verify its current `stakingCodeAuthority`.
2. Verify the target Safe on the **same network**, including all signers and threshold.
3. Current authority calls `transferStakingCodeAuthority(SAFE_ADDRESS)`; confirm the emitted nomination and `pendingStakingCodeAuthority`.
4. Through the Safe's own transaction workflow, execute `acceptStakingCodeAuthority()` on the factory. Merely connecting a signer or proposing a transaction does not execute it.
5. Confirm `stakingCodeAuthority == SAFE_ADDRESS`, pending authority cleared, old authority denied, and Safe-controlled emergency revocation operational.
6. If the proposed Safe or configuration is wrong **before acceptance**, current authority calls `cancelStakingCodeAuthorityTransfer()`.

**Do not use unverified addresses or execute mainnet transactions from this document.**

## Release decision

**NO-GO** until the above evidence is collected and independently reviewed. Preserve Issue #3 as open; do not merge or deploy solely on 267 passing tests.
