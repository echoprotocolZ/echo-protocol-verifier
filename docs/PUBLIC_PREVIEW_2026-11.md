# Echo Protocol Z — Public Preview (November 2026)

**Status: Technical preview / testing — not a production launch.**

Echo Protocol Z is developing an authorization and routing security architecture combining geographic checkpoint constraints, zero-knowledge proof verification, transaction-bound permissions, and replay resistance.

## What has been demonstrated

- Local Hardhat run reported **13 passing** tests across the existing V4 real-proof execution and delegation test files (user-provided result, November 2026).
- GitHub Actions [run 43764472224](https://github.com/echoprotocolZ/echo-protocol-verifier/actions/runs/43764472224) passed the V4 security, artifact-independent, and V4 circuit/witness jobs.
- V4 geographic circuit CI accepted three valid witnesses and rejected nine invalid witnesses. **Witness testing is not equivalent to a Groth16 proof.**
- Existing development contracts implement proof-checking and authorization pathways. The base V4 smart account intentionally disables direct ownership transfer and unproven administration.

## What remains gated

- Production deployment and release approvals.
- Full proof-dependent CI on the release branch, and independent review of production-bytecode provenance.
- Confirmation of production smart-account administration, delegation, replay, and staking/token-moving boundaries.
- Any claims about secure live routing, hardware-backed geolocation, VDFs, or guaranteed interception prevention.

## Preview participation

Developers and security reviewers can inspect the [source repository](https://github.com/echoprotocolZ/echo-protocol-verifier) and submit reproducible findings through GitHub Issues. **Do not send private keys, seed phrases, or funds.** No token sale, staking deposit, or investment offer is being announced here.

This preview communicates engineering progress; it does not certify a security audit or guarantee protocol security.

_Last updated: November 15, 2026._
