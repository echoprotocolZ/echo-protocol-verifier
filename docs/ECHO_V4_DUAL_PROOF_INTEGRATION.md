# The Original Echo Protocol Z
## V4 Dual-Proof Authorization Requirements

Original creator and visionary: Zachary Anello

Status: Development design — not production approved.

### 1. V4 smart account

Create a separate EchoSmartAccountV4 contract.

- Require the V4 authorization bridge for protected execution.
- Do not expose a V3-only execution path.
- Bind the account to its intended authorization bridge.
- Preserve nonce and reentrancy protections.
- Keep administration explicitly restricted.
- Execute authorization and target calls atomically.

### 2. V4 authorization bridge

Require BOTH:

- A valid V3 authorization proof.
- A valid V4 checkpoint-bound geographic proof.

Both proofs must reference the same checkpoint commitment.

The bridge must also enforce:

- Authenticated account and delegatee identities.
- Valid checkpoint signature and authorized validator.
- Approved geographic zone matching the signed zoneHash.
- Geographic proof public bounds matching the approved zone.
- Correct chain ID, transaction target, value and calldata.
- Expiration, nonce and nullifier replay protections.
- Valid checkpoint consumption.

### 3. Geographic proof gateway

Use the existing EchoGeographicProofGatewayV4.

The eventual bridge must derive account, delegatee,
checkpoint commitment and signed zoneHash from authenticated
authorization data, not arbitrary caller-supplied identities.

### 4. V3 compatibility

Leave existing V3 contracts unchanged.

Existing V3 smart accounts remain V3-only until an
explicitly designed and tested migration is performed.

Do not claim V4 protection for existing V3 accounts.

### 5. Security limitations

A valid geographic proof demonstrates mathematical
consistency with supplied private coordinates.

It does not independently prove that a device's GPS
reading is authentic or physically trustworthy.

Production requires additional threat modeling,
GPS provenance controls, secure proving setup,
integration testing and independent security review.

### 6. Deployment restrictions

Do not deploy to Polygon Mainnet without explicit approval.

Do not alter ECHO token contracts or existing V3 keys.

