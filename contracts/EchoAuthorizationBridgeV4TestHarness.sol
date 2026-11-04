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

}
