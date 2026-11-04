// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Development-only verifier mock. Never use in production.
contract EchoV4DualProofVerifierMock {
    enum Mode { Accept, Reject, Revert }
    Mode public mode;

    function setMode(Mode nextMode) external {
        mode = nextMode;
    }

    struct SignedCheckpoint {
        address account;
        address delegatee;
        bytes32 zoneHash;
        bytes32 checkpointCommitment;
        bytes32 authorizationCommitment;
        uint64 timestamp;
        uint256 nonce;
    }

    function verifyDualProof(
        SignedCheckpoint calldata checkpoint,
        uint[2] calldata v3A,
        uint[2][2] calldata v3B,
        uint[2] calldata v3C,
        uint[20] calldata v3Signals,
        uint[2] calldata v4A,
        uint[2][2] calldata v4B,
        uint[2] calldata v4C,
        uint[5] calldata v4Signals
    ) external view returns (bool) {
        if (mode == Mode.Revert) revert("Mock verifier reverted");
        return mode == Mode.Accept;
    }
}
