# Echo Protocol Z — checkpoint binding security specification

Status: security requirement and regression-test plan; NOT a completed audit or evidence of a passing test.

## Threat model

An attacker obtains a valid Groth16 proof for checkpoint A and a separately valid validator signature for checkpoint B, then combines them into one authorization. Merely checking that both timestamps are within an allowed range does not establish that they refer to the same checkpoint.

## Required invariant

Let P = (x_p, y_p, t_p) be the checkpoint represented in the proof witness, and S = (x_s, y_s, t_s) the checkpoint authenticated by the validator signature. The authorization must bind both to the same canonical commitment:

C = Poseidon(domain, canonical(x), canonical(y), canonical(t), context)

The proof must constrain C_proof = C_public. The validator-signed message must include C_public (or an unambiguous cryptographic commitment to it) and the verifier must check its recovered signer and all contextual fields. If the design uses different hash functions, enforce an explicit proven binding between their canonical inputs rather than comparing unrelated hashes.

Required context should include chain ID, account, transaction/intent digest, nonce, expiry, checkpoint domain/version and any relevant zone/policy identifiers. Public inputs, signed payload, Solidity encoding and circuit field encoding must agree exactly. A timestamp window check is additional to, not a replacement for, equality binding.

Do not assume the recovered historical equations are identical to current source; map each field to actual Circom and Solidity code before changing deployed logic.

## Regression matrix

1. Positive: proof and signature bind to the same checkpoint, transaction and policy; succeeds exactly once.
2. Negative: valid proof for timestamp A + valid signature for timestamp B, where A != B but both are within policy window; revert.
3. Negative: same timestamp, different coordinates; revert.
4. Negative: same checkpoint, different account; revert.
5. Negative: same checkpoint, different chain ID; revert.
6. Negative: same checkpoint, different transaction digest, value or calldata; revert.
7. Negative: same checkpoint, different nonce or authorization expiry; revert.
8. Negative: valid checkpoint with altered geographic policy/zone hash; revert.
9. Negative: nullifier replay, including attempts with alternate valid signatures; revert.
10. Negative: proof public-signal order changed or field value exceeds canonical BN254 scalar encoding; revert.
11. Boundary: exactly minimum/maximum permitted timestamp and radius; apply documented inclusive/exclusive policy.
12. Atomicity: when any downstream call fails, authorization and nullifier consumption roll back.

## Acceptance criteria

- Tests exercise actual verifier/bridge/account execution paths, not mocks that skip proof verification.
- A reproducible clean checkout can generate or retrieve reviewed proof fixtures with documented checksums.
- Trusted setup .zkey verification succeeds against its intended .r1cs and .ptau. An INVALID alpha1 result blocks release.
- All regression tests pass in CI, with evidence and a code-review record.
- Independent audit and production-readiness review remain mandatory before mainnet activation.

## Separate protocol research

K-of-N fragment reconstruction, VDF timing, physical location authenticity and Proof-of-Routing economics remain separate claims requiring independent threat modeling. A cryptographic proof of coordinates/timestamp does not establish that those values came from trustworthy hardware. Erasure coding alone does not provide payload confidentiality.
