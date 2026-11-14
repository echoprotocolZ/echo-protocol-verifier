# Echo Protocol Z — source-grounded checkpoint binding review

Review scope: repository source inspection, not a completed audit. Production deployment remains blocked.

## Observed V3/V4 Solidity invariants

- `EchoAuthorizationBridgeV3.authorize` and `verifyCheckpointProof` compare signed checkpoint commitment to `signals[18]` and signed timestamp to `signals[19]` exactly; they also check account, delegatee, nonce, authorization commitment and timestamp bounds.
- `EchoAuthorizationBridgeV4._validateCheckpointBinding` repeats the exact timestamp and checkpoint commitment comparisons.
- `EchoDualProofVerifierV4.verifyDualProof` compares V3 signal 18 and V4 signal 4 against the same signed checkpoint commitment.
- The V4 authorization bridge obtains the signed digest from the checkpoint registry and uses `ECDSA.recover`, checking the signer against V3 signal 5; the registry separately enforces signer trust and replay policy.
- V4 transaction binding checks chain ID, target, value, calldata hash halves, nonce and expiry against V3 signals.
- V3/V4 verifier contracts and bridge paths are separate from the experimental `SpatiotemporalFragmentVerifierBound.circom` circuit. That new circuit is not currently wired into the deployed V3/V4 proof path.

## Critical unresolved proof obligations

1. Identify the exact Circom source and build provenance for the **20-public-signal V3** verifier key and the **5-public-signal V4** verifier key.
2. Prove that V3 `signals[18]` is constrained to the intended checkpoint coordinates/timestamp commitment, and `signals[19]` is constrained to the same private timestamp. Comparing public signals in Solidity is insufficient if those signals are not constrained correctly in the proof.
3. Prove that V4 `signals[4]` is constrained to the identical checkpoint commitment, including matching field encodings and Poseidon parameters.
4. Verify trusted setup artifacts against the exact R1CS, PTAU and exported verification key; resolve any `INVALID: Invalid alpha1` before release.
5. Exercise real Groth16 proofs and validator EIP-712 signatures in Hardhat adversarial tests. Source-string guards and witness tests alone do not satisfy this requirement.
6. Verify the registry's signed digest includes chain/account/nonce/zone/checkpoint/authorization fields, and that the account's execution path binds authorization to the exact executed calldata and value.
7. Review canonical BN254 scalar ranges, 32/64-bit coordinate/time encodings, arithmetic bounds and signed geographic coordinate representation.

## Finding and disposition

**Potential high-severity integration risk, not a confirmed exploit:** the Solidity checks are present, but their security depends on proof circuit constraints and trusted setup provenance. Do not describe the issue as fixed solely because the public signals are compared.

## Evidence inspected

- `contracts/EchoAuthorizationBridgeV3.sol`
- `contracts/EchoAuthorizationBridgeV4.sol`
- `contracts/EchoDualProofVerifierV4.sol`
- `contracts/EchoAuthorizationVerifierV3.sol`
- `SpatiotemporalFragmentVerifier.circom`
- `SpatiotemporalFragmentVerifierBound.circom`

No transaction, deployment, key rotation or token movement was performed.
