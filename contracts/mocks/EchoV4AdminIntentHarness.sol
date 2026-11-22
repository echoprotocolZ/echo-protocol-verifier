// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../EchoV4AdminIntent.sol";

/// @dev Test-only wrapper; never deploy as an administrative authority.
contract EchoV4AdminIntentHarness {
    function ownershipProposalPayload(
        address account,
        address successor,
        uint256 chainId,
        uint256 nonce,
        uint256 deadline
    ) external pure returns (bytes memory) {
        return EchoV4AdminIntent.ownershipProposalPayload(
            account, successor, chainId, nonce, deadline
        );
    }
}
