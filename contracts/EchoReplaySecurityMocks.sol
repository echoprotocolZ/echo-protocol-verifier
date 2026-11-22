// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only checkpoint registry for verifying atomic rollback.
/// @dev Does not authenticate signatures. Never use in production.
contract EchoReplayRegistryMock {
    struct SignedCheckpoint {
        address account;
        address delegatee;
        bytes32 zoneHash;
        bytes32 checkpointCommitment;
        bytes32 authorizationCommitment;
        uint64 timestamp;
        uint256 nonce;
    }
    mapping(bytes32 => bool) public consumed;
    bool public failConsumption;
    function setFailConsumption(bool value) external { failConsumption = value; }
    function checkpointDigest(SignedCheckpoint calldata) external pure returns (bytes32) {
        return keccak256("echo-replay-test-checkpoint");
    }
    function consumeCheckpointFromBridge(
        SignedCheckpoint calldata checkpoint, bytes calldata signature
    ) external returns (bytes32) {
        require(!failConsumption, "forced checkpoint failure");
        bytes32 key = keccak256(abi.encode(checkpoint, signature));
        require(!consumed[key], "checkpoint already consumed");
        consumed[key] = true;
        return key;
    }
}
