# ECHO Protocol V3 — Geographic Encoding Specification

Status: Proposed production interoperability standard.
Current implementation: Bounded unsigned integer coordinates.
Production GPS integration: Not yet verified.

## 1. Current Circuit Behavior

EchoAuthorizationVerifierV3.circom uses:

- targetX and targetY: public 32-bit unsigned integers.
- checkpointX and checkpointY: private 32-bit unsigned integers.
- maxDistanceSq: public 64-bit unsigned integer.

The circuit enforces:

distanceSq = (checkpointX - targetX)^2
           + (checkpointY - targetY)^2

distanceSq <= maxDistanceSq

The calculation uses finite-field arithmetic with range constraints.

The circuit does not independently verify GPS measurements,
physical distance in meters, or the trustworthiness of a
checkpoint issuer.

## 2. Proposed GPS Encoding

Precision: 10^7 integer units per degree.

Latitude X:
  round((latitudeDegrees + 90) * 10000000)

Longitude Y:
  round((longitudeDegrees + 180) * 10000000)

Valid encoded latitude range:
  0 through 1800000000

Valid encoded longitude range:
  0 through 3600000000

Example:
  Latitude: 39.5296
  Longitude: -119.8138

  Encoded X: 1295296000
  Encoded Y: 601862000

This convention is proposed, not verified as implemented
across existing witness generators and checkpoint issuers.

## 3. Geographic Distance Limitations

Squared differences in encoded latitude and longitude
are not equivalent to squared distances in meters.

Longitude scale varies with latitude.

Production geofencing requires a documented geographic
distance model, precision policy, and error analysis.

A projected local coordinate system or appropriately
validated geographic distance calculation may be required.

## 4. Required Integration Boundaries

### GPS and checkpoint issuer

- Validate physical latitude and longitude ranges.
- Apply consistent scaling, offsets, and rounding.
- Authenticate the source of location measurements.
- Establish checkpoint freshness and integrity.

### Witness generator and circuit

- Use identical coordinate encoding.
- Validate geographic domain limits.
- Match distance threshold units to coordinate units.
- Verify checkpoint commitment construction.
- Test boundary and malformed-coordinate cases.

### Solidity and authorization bridge

- Preserve the verified 20-public-signal ordering.
- Verify checkpoint signatures and validator authorization.
- Enforce chain, account, nonce, deadline, and replay policy.
- Ensure application geographic policy matches circuit semantics.

## 5. Current Security Limitations

The existing circuit enforces 32-bit coordinate ranges,
not the narrower valid latitude and longitude ranges.

The proposed GPS encoding is not yet enforced as a
complete geographic domain specification.

Passing Hardhat tests and reproducible Circom compilation
do not constitute an independent cryptographic audit.

## 6. Production Release Requirements

Before describing ECHO V3 as production GPS geofencing:

1. Finalize the coordinate encoding and distance model.
2. Verify issuer, witness, circuit, and contract consistency.
3. Add adversarial geographic boundary tests.
4. Complete independent circuit and smart contract audits.
5. Establish production trusted setup provenance.

## 7. Verified Geographic Domain Finding

Finding ID: ECHO-V3-GEO-001
Status: Confirmed at the R1CS constraint level
Classification: Geographic application-policy gap
Production impact: Requires remediation before GPS geofencing claims

### Reproduction

Using the current timestamp-bound V3 circuit:

- targetX = 1800000001
- checkpointX = 1800000001
- targetY = 200000
- checkpointY = 200000
- maxDistanceSq = 10000

The checkpoint, authorization, fragment, and nullifier
commitments were recomputed consistently.

The Circom witness generator produced a witness.

The following command completed successfully:

npx snarkjs wtns check \
  build/v3-timestamp-fixed/EchoAuthorizationVerifierV3.r1cs \
  /tmp/echo-v3-invalid-gps.wtns

Result: WITNESS IS CORRECT

### Interpretation

The coordinate value 1800000001 is valid under the
current 32-bit unsigned circuit constraint.

It exceeds the proposed unsigned latitude encoding
maximum of 1800000000.

Therefore, the existing circuit does not enforce the
proposed production latitude domain.

This does not establish a forged checkpoint, invalid
validator signature acceptance, or authorization bypass.

### Recommended Remediation

1. Finalize the geographic coordinate encoding.
2. Define the intended distance units and geographic model.
3. Enforce valid coordinate ranges at the appropriate
   cryptographic and application trust boundaries.
4. Add valid, invalid, and boundary-case witness tests.
5. Re-audit and regenerate cryptographic artifacts if
   circuit constraints are changed.
