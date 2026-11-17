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
}
