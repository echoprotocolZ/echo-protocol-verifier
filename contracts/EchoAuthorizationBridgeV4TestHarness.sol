// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoAuthorizationBridgeV4.sol";

/// @notice Test-only harness. Never deploy to production.
contract EchoAuthorizationBridgeV4TestHarness
    is EchoAuthorizationBridgeV4
{
    constructor(
        address verifier_,
        address registry_
    ) EchoAuthorizationBridgeV4(verifier_, registry_) {}

    function testConsumeNullifier(
        address account,
        uint256 nullifier
    ) external {
        _consumeNullifier(account, nullifier);
    }
    /// @notice Exposes transaction validation for local testing only.
    function testValidateTransactionBinding(
        uint[20] calldata signals,
        address target,
        uint256 value,
        bytes calldata callData,
        uint256 expectedNonce
    ) external view {
        _validateTransactionBinding(
            signals, target, value, callData, expectedNonce
        );
    }

    /// @notice Test-only checkpoint binding wrapper.
    function testValidateCheckpointBinding(
        SignedCheckpoint calldata checkpoint,
        uint[20] calldata signals
    ) external pure {
        _validateCheckpointBinding(checkpoint, signals);
    }


    /// @notice Test-only access to validator signature binding.
    function exposedValidateValidatorSignature(
        SignedCheckpoint calldata checkpoint,
        bytes calldata signature,
        uint[20] calldata signals
    ) external view {
        _validateValidatorSignature(checkpoint, signature, signals);
    }


    /// @notice TEST ONLY: exposes registry checkpoint consumption.
    /// @dev Bypasses proof checks; never deploy this harness to production.
    function exposedConsumeAuthenticatedCheckpoint(
        SignedCheckpoint calldata checkpoint,
        bytes calldata signature
    ) external returns (bytes32) {
        return _consumeAuthenticatedCheckpoint(checkpoint, signature);
    }


    /// @dev Development-only account authorization test wrapper.
    function exposedValidateAccountAuthorization(
        SignedCheckpoint calldata checkpoint
    ) external view {
        _validateAccountAuthorization(checkpoint);
    }


    /// @dev Development-only dual-proof validation wrapper.
    function exposedValidateDualProof(
        SignedCheckpoint calldata checkpoint,
        uint[2] calldata v3A,
        uint[2][2] calldata v3B,
        uint[2] calldata v3C,
        uint[20] calldata v3Signals,
        uint[2] calldata v4A,
        uint[2][2] calldata v4B,
        uint[2] calldata v4C,
        uint[5] calldata v4Signals
    ) external view {
        _validateDualProof(
            checkpoint,
            v3A, v3B, v3C, v3Signals,
            v4A, v4B, v4C, v4Signals
        );
    }

}
