// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEchoGroth16VerifierV3 {
    function verifyProof(
        uint[2] calldata proofA,
        uint[2][2] calldata proofB,
        uint[2] calldata proofC,
        uint[19] calldata signals
    ) external view returns (bool);
}

/// @notice V3 bridge foundation. Authorization is not yet implemented.
contract EchoAuthorizationBridgeV3 {
    struct SignedCheckpoint {
        address account;
        address delegatee;
        bytes32 zoneHash;
        bytes32 checkpointCommitment;
        bytes32 authorizationCommitment;
        uint64 timestamp;
        uint256 nonce;
    }

    error CheckpointBindingMismatch();

    /// @notice Checks that signed checkpoint fields match ZK public signals.
    /// @dev This does not verify the signature or Groth16 proof.
    function validateCheckpointBinding(
        SignedCheckpoint calldata checkpoint,
        uint[19] calldata signals
    ) external pure returns (bool) {
        if (
            uint256(checkpoint.checkpointCommitment) != signals[1] ||
            uint256(checkpoint.authorizationCommitment) != signals[2] ||
            uint256(uint160(checkpoint.account)) != signals[4] ||
            uint256(uint160(checkpoint.delegatee)) != signals[5] ||
            checkpoint.nonce != signals[12] ||
            checkpoint.timestamp < signals[17] ||
            checkpoint.timestamp > signals[18]
        ) revert CheckpointBindingMismatch();

        return true;
    }

    IEchoGroth16VerifierV3 public immutable verifier;
    address public immutable checkpointRegistry;

    error InvalidContract();

    constructor(address verifierAddress, address registryAddress) {
        if (
            verifierAddress == address(0) ||
            registryAddress == address(0) ||
            verifierAddress.code.length == 0 ||
            registryAddress.code.length == 0
        ) revert InvalidContract();

        verifier = IEchoGroth16VerifierV3(verifierAddress);
        checkpointRegistry = registryAddress;
    }
}
