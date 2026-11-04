// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only mock. Never use as a production verifier.
contract EchoDualProofTestMockV4 {
    struct SignedCheckpoint {
        address account;
        address delegatee;
        bytes32 zoneHash;
        bytes32 checkpointCommitment;
        bytes32 authorizationCommitment;
        uint64 timestamp;
        uint256 nonce;
    }

    bool public approved = true;

    function setApproved(bool value) external {
        approved = value;
    }

    function verifyCheckpointProof(
        SignedCheckpoint calldata,
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[20] calldata
    ) external view returns (bool) {
        return approved;
    }

    function verifyApprovedGeographicProof(
        address,
        address,
        bytes32,
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[5] calldata
    ) external view returns (bool) {
        return approved;
    }
}
