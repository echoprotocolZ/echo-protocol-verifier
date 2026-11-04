# ECHO V3 Geographic Trust Boundary

## Status
Security design review. Not production approved.

## Confirmed behavior

The V3 Circom circuit:
- Binds checkpoint coordinates and timestamp to a Poseidon commitment.
- Enforces an integer-coordinate squared-distance limit.
- Enforces timestamp constraints.
- Does not enforce the proposed GPS latitude/longitude domain.

The V3 registry:
- Validates trusted checkpoint signatures.
- Enforces the account's allowed zone hash.
- Enforces checkpoint timestamp freshness.
- Prevents checkpoint replay.

The V3 authorization bridge:
- Binds the checkpoint and authorization commitments to public signals.
- Verifies the Groth16 proof.
- Matches the proof validator to the checkpoint signer.
- Enforces authorization and replay protections.

## Geographic trust boundary

A valid Groth16 proof establishes satisfaction of the
implemented circuit constraints.

A valid validator signature establishes that the trusted
signing key authorized the checkpoint.

Neither establishes that the coordinates came from a
genuine physical-location measurement.

The reviewed integration test assigns zoneHash independently
of the checkpoint coordinates.

## Open security requirements

1. Define the production geographic coordinate encoding.
2. Define coordinate-to-zone membership rules.
3. Enforce the permitted coordinate domain.
4. Authenticate the checkpoint issuer.
5. Establish location measurement provenance and anti-spoofing controls.
6. Define signing-key protection and revocation procedures.
7. Test geographic policy failures end to end.
8. Complete an independent security audit.

## Cryptographic compatibility

Adding new constraints to the Circom circuit changes the
constraint system and requires a new trusted setup/proving key,
verification key, and corresponding Solidity verifier.

Application-layer validation may preserve existing cryptographic
artifacts but cannot make the current circuit enforce rules
that it does not contain.

## Deployment restrictions

Do not change existing V3 proving keys or deployments
as part of geographic remediation.

Do not deploy to Polygon Mainnet without explicit authorization.

## Related finding

ECHO-V3-GEO-001:
The existing circuit accepts some coordinates outside the
proposed GPS domain while satisfying its current uint32 and
distance constraints.
