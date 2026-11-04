# ECHO V4 Geographic Validation Design

Status: Draft — not implemented or production approved.

## Objective

Create a hardened geographic authorization system
without changing existing ECHO V3 cryptographic artifacts.

## Proposed coordinate encoding

Latitude:
  encodedLatitude = round((latitude + 90) * 10000000)

Longitude:
  encodedLongitude = round((longitude + 180) * 10000000)

Latitude encoded range:
  0 through 1800000000 inclusive

Longitude encoded range:
  0 through 3600000000 inclusive

The precise rounding rule and input representation
must be specified before implementation.

## Required validation

1. Reject coordinates outside the permitted domain.
2. Define how geographic zones are represented.
3. Bind zone identity to authorized coordinate rules.
4. Define an accurate geographic distance model.
5. Reject checkpoints outside the authorized zone.
6. Bind checkpoint coordinates and timestamp to
   the signed attestation and Groth16 proof.
7. Authenticate the checkpoint issuer.
8. Establish controls against location spoofing.
9. Enforce expiration, nonce uniqueness, and replay protection.
10. Test boundary conditions and malicious inputs.

## Distance calculation

The V3 integer-coordinate squared-distance calculation
does not represent geographic distance in meters.

V4 must define an appropriate projection, local coordinate
system, or other formally specified geographic distance
method before implementing radius-based authorization.

## Compatibility

V3 circuits, proving keys, verification keys, contracts,
and deployments must remain unchanged.

Any new Circom constraints require separate cryptographic
artifacts and a corresponding Solidity verifier.

## Security requirements

Complete independent cryptographic and smart-contract
security reviews before production deployment.

No Polygon Mainnet deployment without explicit authorization.
