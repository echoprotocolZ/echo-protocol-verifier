# ECHO Protocol V3 — Security Threat Model

## 1. Scope

This document describes the security assumptions, tested protections, and outstanding risks of the ECHO V3 authorization system.

Components:
- Circom Groth16 authorization circuit
- Solidity Groth16 verifier
- Authorization bridge
- Attestation registry
- Smart account

Status: Development security review. Not an independent audit or production certification.

## 2. Security Objectives

ECHO V3 aims to ensure that:
- Only properly authorized executions succeed.
- Proofs are bound to the intended account and transaction.
- Authorization cannot be replayed.
- Checkpoint commitments and timestamps are validated.
- Revoked validators cannot authorize new executions.
- Failed executions do not permanently consume authorization state.
- Reentrant execution attempts are rejected.

## 3. Tested Attack Scenarios

The development test suite includes checks covering:

| Threat | Intended Protection |
|---|---|
| Modified calldata | Calldata hash binding |
| Altered timestamp | Circuit and checkpoint timestamp binding |
| Unauthorized signature | Authorization signature verification |
| Modified checkpoint commitment | Checkpoint commitment verification |
| Substituted execution target | Target binding |
| Modified nonce | Nonce binding |
| Expired authorization | Deadline validation |
| Cross-account replay | Account binding |
| Cross-chain replay | Chain ID binding |
| Revoked validator | Validator trust enforcement |
| Repeated authorization | Nullifier and checkpoint consumption |
| Reentrant execution | Smart account reentrancy protection |
| Failed execution | State rollback |

These are tested behaviors, not guarantees against every possible attack.

## 4. Trust Assumptions

Security depends on:
- Correct circuit constraints.
- Sound Groth16 proving and verification.
- Secure trusted setup.
- Honest and appropriately governed validator administration.
- Correct registry and bridge configuration.
- Secure account ownership and key management.
- Appropriate blockchain finality assumptions.

## 5. Outstanding Security Risks

Independent auditors should investigate:
- Production trusted setup provenance and ceremony verification.
- Circuit soundness and unconstrained signals.
- EIP-712 signature domain separation.
- Validator governance and revocation timing.
- Checkpoint freshness and finality.
- Nullifier uniqueness and consumption behavior.
- Reentrancy across external contract interactions.
- Administrative privilege boundaries.
- Denial-of-service and gas exhaustion.
- Emergency response and verifier replacement strategy.
- Chain-specific deployment and configuration risks.
- ERC-4337, EIP-7702, and Paymaster integration, if added.

## 6. Production Restrictions

Passing local tests does not establish production security.

A production deployment requires independent review, verified production ceremony artifacts, deployment validation, and an incident-response plan.

No deployment to Polygon Mainnet is authorized by this document.
