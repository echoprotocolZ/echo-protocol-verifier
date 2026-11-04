# The Original Echo Protocol Z
## V4 Dual-Proof Security Specification

Original Creator: Zachary Anello
Development: V4 Research and Implementation
Status: Development specification — not production approved.

### 1. Required Proofs

Every V4-protected transaction must require:

- A valid V3 Groth16 authorization proof.
- A valid V4 checkpoint-bound geographic proof.
- A valid signed checkpoint from an account-trusted validator.

Neither proof alone is sufficient.

### 2. Cross-Proof Binding

The V4 authorization bridge must establish:

- Both proofs reference the same checkpoint commitment.
- The signed checkpoint identifies the same account.
- The signed checkpoint identifies the same delegatee.
- The validator recovered from the signature matches the V3 proof.
- The geographic boundaries match the account's approved zone.
- The geographic proof commitment matches the signed checkpoint.

### 3. Transaction Authorization

The bridge must independently enforce:

- Correct chain ID.
- Authorized target and calldata.
- Transaction value.
- Account nonce.
- Authorization deadline.
- Checkpoint timestamp validity.
- Nullifier uniqueness.
- Checkpoint replay protection.
- Atomic execution and rollback.
- Reentrancy protection.

### 4. V3 Compatibility

Existing V3 contracts remain unchanged.

V4-protected accounts must not expose a V3-only execution path.

The V4 smart account must enforce its designated V4 bridge.

### 5. Geographic Security

All geographic public signals must be range-checked.

The approved zone hash must use the finalized deterministic
ECHO V4 geographic encoding.

The system must not claim that mathematical proof validity
independently establishes genuine physical GPS presence.

### 6. Required Integration Tests

- Valid dual-proof authorization.
- Invalid V3 proof.
- Invalid V4 proof.
- Different checkpoint commitments.
- Incorrect signed account.
- Incorrect delegatee.
- Untrusted validator.
- Revoked validator.
- Unapproved geographic zone.
- Modified geographic boundaries.
- Replayed checkpoint.
- Replayed nullifier.
- Expired authorization.
- Unauthorized transaction target.
- V3-only execution bypass attempt.
- Reentrancy and failed-execution rollback.

### 7. Deployment Restrictions

Development only.

No Polygon Mainnet deployment without explicit approval,
independent security review and production cryptographic setup.
