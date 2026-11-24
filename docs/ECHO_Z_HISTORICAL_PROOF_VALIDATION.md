# Historical proof regression validation

2026-11-24. User reports PASS after running the targeted historical cross-account regression from commit 9ec54aa64683ad3fbd318c77a186cdc41441349e in the detached local validation worktree with recovered fixture fresh-1794738331-nonce-1.

The updated test requires both Solidity proof verifiers to accept, matching checkpoint fields and nonce, EIP-712 signature recovery against the original Amoy registry domain and proof validator, exact InvalidDelegationIntent revert, and unchanged nonce/delegatee/nullifier state.

Evidence classification: targeted pass user-reported, raw output not captured. Earlier full local suite 801 passing predates these assertions. Independently inspected GitHub run 603: 742 artifact-independent tests passing, V4 circuit and security jobs successful, trusted rollback and full diagnostic skipped.

Limitations: historical signer registration at a pinned block not established; negative test does not isolate account mismatch from other intent mismatches. Artifact provenance, independent full reproduction and external audit remain open. No production changes or release authorization.
