// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoGeographicZoneV4.sol";

/// @title EchoDualProofVerifierV4
/// @notice Development-only dual-proof verification foundation.
/// @dev The Original Echo Protocol Z.

interface IEchoV3CheckpointProof {
    struct SignedCheckpoint {
        address account;
        address delegatee;
        bytes32 zoneHash;
        bytes32 checkpointCommitment;
        bytes32 authorizationCommitment;
        uint64 timestamp;
        uint256 nonce;
    }

    function verifyCheckpointProof(
        SignedCheckpoint calldata checkpoint,
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[20] calldata signals
    ) external view returns (bool);
}

interface IEchoV4GeographicGateway {
    function verifyApprovedGeographicProof(
        address account,
        address delegatee,
        bytes32 expectedCheckpointCommitment,
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[5] calldata signals
    ) external view returns (bool);
}

contract EchoDualProofVerifierV4 {
    IEchoV3CheckpointProof public immutable v3Bridge;
    IEchoV4GeographicGateway public immutable v4Gateway;

    error InvalidDependency();
    error CheckpointMismatch();
    error SignedZoneMismatch();
    error GeographicSignalOutOfRange();
    error InvalidV3Proof();
    error InvalidV4Proof();

    constructor(address v3Bridge_, address v4Gateway_) {
        if (
            v3Bridge_ == address(0) ||
            v4Gateway_ == address(0) ||
            v3Bridge_.code.length == 0 ||
            v4Gateway_.code.length == 0
        ) revert InvalidDependency();

        v3Bridge = IEchoV3CheckpointProof(v3Bridge_);
        v4Gateway = IEchoV4GeographicGateway(v4Gateway_);
    }

    function verifyDualProof(
        IEchoV3CheckpointProof.SignedCheckpoint calldata checkpoint,
        uint[2] calldata v3A,
        uint[2][2] calldata v3B,
        uint[2] calldata v3C,
        uint[20] calldata v3Signals,
        uint[2] calldata v4A,
        uint[2][2] calldata v4B,
        uint[2] calldata v4C,
        uint[5] calldata v4Signals
    ) external view returns (bool) {
        if (
            v3Signals[18] != uint256(checkpoint.checkpointCommitment) ||
            v4Signals[4] != uint256(checkpoint.checkpointCommitment)
        ) revert CheckpointMismatch();


        // Bind V4 geographic boundaries to the signed checkpoint.
        if (
            v4Signals[0] > 1800000000 ||
            v4Signals[1] > 1800000000 ||
            v4Signals[2] > 3600000000 ||
            v4Signals[3] > 3600000000
        ) revert GeographicSignalOutOfRange();

        EchoGeographicZoneV4.Zone memory zone =
            EchoGeographicZoneV4.Zone({
                minLat: uint32(v4Signals[0]),
                maxLat: uint32(v4Signals[1]),
                minLon: uint32(v4Signals[2]),
                maxLon: uint32(v4Signals[3])
            });

        if (EchoGeographicZoneV4.hash(zone) != checkpoint.zoneHash) {
            revert SignedZoneMismatch();
        }

        if (!v3Bridge.verifyCheckpointProof(
            checkpoint, v3A, v3B, v3C, v3Signals
        )) revert InvalidV3Proof();

        if (!v4Gateway.verifyApprovedGeographicProof(
            checkpoint.account,
            checkpoint.delegatee,
            checkpoint.checkpointCommitment,
            v4A, v4B, v4C, v4Signals
        )) revert InvalidV4Proof();

        return true;
    }
}
