
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EchoV3CheckpointMock {
    bool public result = true;

    struct SignedCheckpoint {
        address account;
        address delegatee;
        bytes32 zoneHash;
        bytes32 checkpointCommitment;
        bytes32 authorizationCommitment;
        uint64 timestamp;
        uint256 nonce;
    }

    function setResult(bool value) external {
        result = value;
    }

    function verifyCheckpointProof(
        SignedCheckpoint calldata,
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[20] calldata
    ) external view returns (bool) {
        return result;
    }
}

contract EchoV4GeographicMock {
    bool public result = true;

    function setResult(bool value) external {
        result = value;
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
        return result;
    }
}
