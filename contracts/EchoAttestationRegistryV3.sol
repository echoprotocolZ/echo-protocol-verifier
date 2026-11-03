// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EchoAttestationRegistryV3
/// @notice Foundation for authenticated checkpoint attestations.
/// @dev Signature verification and authorization are not yet implemented.
contract EchoAttestationRegistryV3 {

    enum AttestationTier {
        ValidatorOnly,
        HybridPreferred,
        HardwareStrict
    }

    struct AttestationPolicy {
        bytes32 allowedZoneHash;
        uint64 maxTimeDrift;
        AttestationTier requiredTier;
        bool allowValidatorFallback;
        bool enabled;
    }

    mapping(address => mapping(address => AttestationPolicy))
        public attestationPolicies;

    event AttestationPolicyUpdated(
        address indexed account,
        address indexed delegatee,
        AttestationTier requiredTier
    );

    error InvalidDelegatee();
    error InvalidAttestationPolicy();

    /// @notice Configure an attestation policy for the calling account.
    function setAttestationPolicy(
        address delegatee,
        AttestationPolicy calldata policy
    ) external {
        if (delegatee == address(0)) revert InvalidDelegatee();

        if (policy.enabled) {
            if (
                policy.allowedZoneHash == bytes32(0) ||
                policy.maxTimeDrift == 0
            ) revert InvalidAttestationPolicy();

            // HardwareStrict must never allow validator-only fallback.
            if (
                policy.requiredTier == AttestationTier.HardwareStrict &&
                policy.allowValidatorFallback
            ) revert InvalidAttestationPolicy();
        }

        attestationPolicies[msg.sender][delegatee] = policy;

        emit AttestationPolicyUpdated(
            msg.sender,
            delegatee,
            policy.requiredTier
        );
    }
}
