# EchoStaking production-source preliminary review — 2026-11-11

**Status: OPEN / NO-GO.** Source supplied by project owner, not yet independently bytecode-matched to Polygon deployment. Solidity ^0.8.20, OpenZeppelin Ownable/ReentrancyGuard/Pausable/SafeERC20. Do not replace deployed contracts based solely on this review.

## Source observations

- Immutable `echoToken` set in constructor; `stake(uint256)` is `nonReentrant whenNotPaused`, checks exact token balance delta and enforces 1,000 ECHO minimum cumulative stake.
- `requestUnstake` requires lock expiry; `withdraw` requires 24-hour unbonding, is `nonReentrant`, and deliberately has no `whenNotPaused` modifier.
- `fundRewards` checks exact balance delta; owner-only `distributeReward` reduces reward pool and transfers to an active, non-quarantined validator.
- `rescueExcessTokens` restricts owner withdrawal of ECHO to balance exceeding `totalStaked + rewardPool`. Accounting assumes standard token balance semantics.
- Owner can configure `registryAddress` and `forensicOracle`; owner, registry and oracle can call `slash` and `slashNode`. `slash` has no evidence argument besides incident ID; `slashNode` accepts caller-supplied drift without cryptographic verification.
- `_slash` marks a unique incident, deducts up to 100 ECHO, transfers value to rewardPool in accounting, and quarantines validator. Owner alone can reactivate.
- On additional stake, an unexpired lock is **not** extended (`if (v.unlockTime < block.timestamp)`). Confirm desired economics and lock policy.
- `setForensicOracle` accepts any address including EOA or zero. This is a privileged authority, not proof of verified evidence.
- There is no general `transferFrom` call targeting arbitrary tokens inside `stake`; it calls only the immutable `echoToken`. This is positive for Z account's approved staking boundary, **provided the deployed bytecode, token identity, and governance are verified**.

## Required tests and decisions

1. Match verified on-chain source, runtime bytecode, constructor ECHO token address, ownership, registry and oracle addresses to this source.
2. Threat-model compromise of owner, forensic oracle and registry; decide evidence/signature validation and incident-ID scope; test unauthorized slashing, replay and cooldown.
3. Confirm pause policy, withdrawal availability during pause, quarantine effects on withdrawals and reward claims.
4. Test solvency invariants after stake, rewards, slashing, partial withdrawal, reactivation, rescue and nonstandard token behavior.
5. Confirm additional stake lock semantics; decide whether every deposit should restart the 90-day lock.
6. Validate `EchoSmartAccountZ` can stake with this production implementation using real proofs and the factory's address/codehash/token approvals; use a **separate local fixture**, never redeploy or alter existing Polygon mainnet contract.
7. Independent audit remains mandatory.

**Conclusion:** No automatic approval of production staking target. Mainnet deployment and Issue #3 closure remain blocked.
