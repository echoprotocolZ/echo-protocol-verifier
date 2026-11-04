// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoGeographicZoneV4.sol";

interface IEchoGeographicVerifierV4 {
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[5] calldata signals
    ) external view returns (bool);
}

interface IEchoGeographicPolicyV4 {
    function validateApprovedZone(
        address account,
        address delegatee,
        bytes32 zoneHash
    ) external view returns (bool);
}

/// @title EchoGeographicProofGatewayV4
/// @notice Combines V4 proof verification with approved-zone policy.
/// @dev Development component for The Original Echo Protocol Z.
contract EchoGeographicProofGatewayV4 {
    IEchoGeographicVerifierV4 public immutable verifier;
    IEchoGeographicPolicyV4 public immutable policyRegistry;

    error InvalidVerifier();
    error InvalidPolicyRegistry();
    error InvalidGeographicProof();
    error CheckpointCommitmentMismatch();
    error GeographicSignalOutOfRange();

    constructor(address verifier_, address policyRegistry_) {
        if (verifier_ == address(0)) revert InvalidVerifier();
        if (policyRegistry_ == address(0)) {
            revert InvalidPolicyRegistry();
        }

        verifier = IEchoGeographicVerifierV4(verifier_);
        policyRegistry = IEchoGeographicPolicyV4(policyRegistry_);
    }

    function verifyApprovedGeographicProof(
        address account,
        address delegatee,
        bytes32 expectedCheckpointCommitment,
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[5] calldata signals
    ) external view returns (bool) {
        if (signals[4] != uint256(expectedCheckpointCommitment)) {
            revert CheckpointCommitmentMismatch();
        }

        // Reject oversized public signals before uint32 conversion.
        // Latitude and longitude use unsigned offset coordinates.
        if (
            signals[0] > 1800000000 ||
            signals[1] > 1800000000 ||
            signals[2] > 3600000000 ||
            signals[3] > 3600000000
        ) {
            revert GeographicSignalOutOfRange();
        }

        EchoGeographicZoneV4.Zone memory zone =
            EchoGeographicZoneV4.Zone({
                minLat: uint32(signals[0]),
                maxLat: uint32(signals[1]),
                minLon: uint32(signals[2]),
                maxLon: uint32(signals[3])
            });

        bytes32 computedZoneHash = EchoGeographicZoneV4.hash(zone);

        policyRegistry.validateApprovedZone(
            account,
            delegatee,
            computedZoneHash
        );

        if (!verifier.verifyProof(a, b, c, signals)) {
            revert InvalidGeographicProof();
        }

        return true;
    }
}
