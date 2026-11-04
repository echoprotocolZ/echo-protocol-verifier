# The Original Echo Protocol Z
## ECHO V4 Geographic Authorization Architecture

Original Creator: Zachary Anello
Development Stage: V4 local research and implementation

### 1. Objective

Require both V3 authorization verification and V4 geographic
verification before a V4 smart account executes a protected transaction.

### 2. Geographic Zone Encoding

A geographic zone consists of:

- minLat
- maxLat
- minLon
- maxLon

Coordinates use the existing V4 unsigned GPS encoding.

The zone hash will use a deterministic, domain-separated encoding
of all four boundaries.

The exact hashing specification must be finalized and tested
before implementing the V4 bridge.

### 3. Required Authorization Checks

The V4 authorization path must:

1. Verify the V3 authorization proof.
2. Verify the V4 geographic proof.
3. Require matching checkpoint commitments.
4. Require the signed checkpoint zone hash to match the
   geographic boundaries supplied to the V4 verifier.
5. Require that zone hash to match the account's enabled policy.
6. Enforce account, delegatee, nonce, timestamp, and transaction binding.
7. Prevent V3-only authorization bypass for V4-protected accounts.
8. Execute the authorized transaction atomically.

### 4. Contract Strategy

Create separate V4 contracts.

Preserve existing V3 contracts, deployments, and proving artifacts.

The V4 smart account must use a mandatory V4 authorization path.

The V4 bridge must not trust caller-selected geographic boundaries
without validating their approved zone hash.

### 5. Security Requirements

- No unverified geographic proofs.
- No user-selected zone bypass.
- No V3-only execution bypass.
- No checkpoint commitment mismatch.
- No replayed authorization.
- No unauthorized administrative execution.
- No Polygon Mainnet deployment during local development.

### 6. Remaining Limitations

Circuit verification does not independently authenticate a physical
GPS reading.

A trusted location attestation mechanism must be designed and
evaluated separately.

The V4 bound circuit requires its own proving and verification keys.
Existing standalone V4 proving keys cannot be reused.

### 7. Launch Identity

Official planned project name:
The Original Echo Protocol Z

Original creator:
Zachary Anello

Existing on-chain token names, symbols, and deployments must be
reviewed before any proposed launch changes.
