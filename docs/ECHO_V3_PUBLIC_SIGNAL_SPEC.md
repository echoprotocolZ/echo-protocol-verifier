# ECHO Protocol V3 — Public Signal Specification

Version: 1.0  
Status: Development specification  
Public inputs: 20  
Encoding: Flat uint256[20]

## Canonical signal order

The following mapping is based on the Circom input declaration order,
the generated public.json artifact, and the Solidity bridge references.

| Index | Signal | Type | Required invariant |
|---:|---|---|---|
| 0 | expectedFragmentCommitment | Field | Fragment Poseidon commitment |
| 1 | expectedAuthorizationCommitment | Field | Authorization commitment |
| 2 | expectedNullifier | Field | Account-bound nullifier |
| 3 | account | Address / 160 bits | Signed account |
| 4 | delegatee | Address / 160 bits | Authorized delegatee |
| 5 | validator | Address / 160 bits | Recovered validator |
| 6 | target | Address / 160 bits | Execution destination |
| 7 | value | Field | Execution value |
| 8 | calldataHashLow | uint128 | Low calldata hash half |
| 9 | calldataHashHigh | uint128 | High calldata hash half |
| 10 | chainId | Field | Current chain ID |
| 11 | nonce | Field | Expected account nonce |
| 12 | deadline | uint64 | Authorization deadline |
| 13 | targetX | uint32 | Geographic target X |
| 14 | targetY | uint32 | Geographic target Y |
| 15 | maxDistanceSq | uint64 | Maximum squared distance |
| 16 | minTimestamp | uint64 | Minimum checkpoint timestamp |
| 17 | maxTimestamp | uint64 | Maximum checkpoint timestamp |
| 18 | expectedCheckpointCommitment | Field | Signed checkpoint commitment |
| 19 | expectedCheckpointTimestamp | uint64 | Signed checkpoint timestamp |

## Cryptographic invariants

1. Fragment commitment is calculated using Poseidon.
2. Checkpoint commitment includes checkpoint coordinates and timestamp.
3. Authorization commitment includes the checkpoint commitment.
4. Nullifier is bound to account and authorization commitment.
5. Checkpoint timestamp equals public signal 19.
6. Checkpoint commitment equals public signal 18.
7. Authorization commitment equals public signal 1.
8. Nullifier equals public signal 2.
9. Calldata hash is independently reconstructed by the bridge.
10. Chain ID, nonce, target and value are independently checked.

## Range and encoding considerations

The Groth16 verifier validates all 20 public inputs against the
BN254 scalar field modulus.

The circuit explicitly range-constrains geographic coordinates,
maximum distance and timestamp-related values.

Address width, calldata hash decomposition and other semantic
width requirements must also be enforced by the corresponding
bridge comparisons and circuit constraints.

## Ordering warning

The generated public signal order must be treated as authoritative
only after reconciliation against the compiled circuit and proof.

The public input list in the Circom main declaration must not be
used as a substitute for inspecting the actual generated public.json.

Any change to signal ordering requires a new circuit compilation,
trusted setup, verification key, Solidity verifier and proof tests.

## Production requirements

- Independently review all 20 mappings.
- Test signal substitution and permutation attacks.
- Verify all range constraints.
- Reproduce the circuit and proving artifacts.
- Complete independent circuit and Solidity audits.
- Complete a production trusted setup.

No production approval is implied by this development specification.
