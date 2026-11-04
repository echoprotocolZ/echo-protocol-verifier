# ECHO Protocol V3 — Reproducible Build Guide

## Status

Development verification completed. Independent production security audit and trusted setup ceremony remain outstanding.

## Development Environment

- Node.js: 24.21.0
- Hardhat: 2.22.19
- Circom: 2.2.3
- snarkjs: 0.7.6
- Solidity: 0.8.26
- EVM target: Cancun
- Optimizer: enabled, 200 runs
- viaIR: true
- Groth16 curve: BN254

## Dependency Installation

Use the committed package-lock.json:

    npm ci

Do not regenerate the lockfile during reproduction.

## Compile Solidity

    npx hardhat compile

## Compile the Circuit

Create an isolated output directory:

    mkdir -p /tmp/echo-v3-audit-build

Compile the active circuit:

    circom EchoAuthorizationVerifierV3.circom --r1cs --wasm --sym -o /tmp/echo-v3-audit-build

Compare the resulting R1CS against the recorded development artifact:

    cmp /tmp/echo-v3-audit-build/EchoAuthorizationVerifierV3.r1cs build/v3-timestamp-fixed/EchoAuthorizationVerifierV3.r1cs

An empty result with exit status zero indicates byte-for-byte equality.

## Verify Groth16 Proving Key

    npx snarkjs zkey verify build/v3-timestamp-fixed/EchoAuthorizationVerifierV3.r1cs build/v3-replacement/pot14_final.ptau build/v3-timestamp-fixed/EchoAuthorizationVerifierV3_final.zkey

Expected development result: ZKey Ok.

This does not establish production ceremony security.

## Verify Saved Proof

    npx snarkjs groth16 verify build/v3-timestamp-fixed/verification_key.json build/v3-timestamp-fixed/public.json build/v3-timestamp-fixed/proof.json

Expected result: OK.

## Run Security Tests

    npx hardhat test

Recorded baseline: 85 passing tests.

Tests use Hardhat's local test environment and do not require a Polygon Mainnet deployment.

## Verify Artifact Fingerprints

The canonical development artifact manifest is:

    docs/ECHO_V3_ARTIFACT_MANIFEST.json

Recalculate SHA-256 fingerprints and compare them against the manifest before relying on any artifact.

## Public Signal Ordering

Refer to:

    docs/ECHO_V3_PUBLIC_SIGNAL_SPEC.md
    docs/ECHO_V3_PUBLIC_SIGNAL_SPEC.json

The compiled symbol ordering is checked by automated tests.

## Trusted Setup Warning

The recorded proving key is a development artifact.

Independent Phase 1 provenance and a production multi-party Phase 2 ceremony have not been established.

Do not represent these artifacts as production-secure.

## Deployment Safety

The local deployment script is restricted to chain ID 31337 and refuses to overwrite an existing deployment record.

Do not run deployment scripts as part of artifact verification.

No Polygon Mainnet deployment is authorized by this guide.
