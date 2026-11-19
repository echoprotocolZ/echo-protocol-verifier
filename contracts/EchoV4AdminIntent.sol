// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EchoV4AdminIntent
/// @notice Domain-separated encoding for proposed V4 administrative actions.
/// @dev This library does NOT authorize anything. A dedicated account entrypoint,
///      bridge, and actual V3/V4 proof circuits must authenticate the exact
///      encoded bytes before any account state is changed.
library EchoV4AdminIntent {
    bytes32 internal constant OWNERSHIP_PROPOSAL =
        keccak256("ECHO_V4_ADMIN_OWNERSHIP_PROPOSAL_V1");

    error InvalidAccount();
    error InvalidSuccessor();
    error InvalidDeadline();

    function ownershipProposalPayload(
        address account,
        address successor,
        uint256 chainId,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes memory) {
        if (account == address(0)) revert InvalidAccount();
        if (successor == address(0) || successor == account)
            revert InvalidSuccessor();
        if (deadline == 0) revert InvalidDeadline();

        return abi.encode(
            OWNERSHIP_PROPOSAL,
            account,
            successor,
            chainId,
            nonce,
            deadline
        );
    }
    bytes32 internal constant BRIDGE_REGISTRATION =
        keccak256("ECHO_V4_ADMIN_BRIDGE_REGISTRATION_V1");

    error InvalidRegistry();
    error InvalidBridge();

    /// @notice Canonical registration intent bytes only; NOT authorization.
    /// @dev The future bootstrap verifier MUST authenticate this exact payload
    ///      independently of the checkpoint bridge being registered.
    function bridgeRegistrationPayload(
        address account,
        address registry,
        address bridge,
        bool authorized,
        uint256 chainId,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes memory) {
        if (account == address(0)) revert InvalidAccount();
        if (registry == address(0)) revert InvalidRegistry();
        if (bridge == address(0)) revert InvalidBridge();
        if (deadline == 0) revert InvalidDeadline();
        return abi.encode(
            BRIDGE_REGISTRATION,
            account,
            registry,
            bridge,
            authorized,
            chainId,
            nonce,
            deadline
        );
    }

}
