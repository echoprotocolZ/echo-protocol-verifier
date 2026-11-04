# ECHO V4 Geographic Authorization Integration

Status: Development design — not production approved.

## Existing V3 checkpoint commitment

V3 calculates:

Poseidon(checkpointX, checkpointY, checkpointTimestamp)

The resulting checkpoint commitment is bound to the V3 authorization and signed checkpoint.

## V4 geographic requirements

1. Validate encoded latitude and longitude domains.
2. Prove private checkpoint coordinates fall inside public zone boundaries.
3. Calculate the same Poseidon checkpoint commitment as V3.
4. Expose the checkpoint commitment as a public input.
5. Enforce equality between the calculated and expected commitment.
6. Require the verifier to check that zone boundaries match an approved ECHO policy.
7. Bind the geographic proof and V3 authorization to the same checkpoint commitment.
8. Reject mismatched commitments, boundaries, and timestamps.

## Security considerations

A valid geographic proof does not establish genuine physical presence.

Location provenance, GPS spoofing resistance, approved-zone authenticity,
replay protection, and authorization integration require additional controls.

The current V4 standalone circuit is a prototype.

## Implementation strategy

Create a separate V4 integration circuit.

Preserve the existing V3 circuit, contracts, proving keys,
and deployment artifacts.

Test valid and invalid commitments before generating new proving keys.

Do not deploy to Polygon Mainnet without explicit authorization.
