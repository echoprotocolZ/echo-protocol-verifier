// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice TEST ONLY: not a cryptographic verifier. Never deploy to a live chain.
contract EchoBootstrapVerifierMock {
    bytes32 public expectedIntentHash;
    bool public approved;
    function configure(bytes32 intentHash, bool approval) external {
        expectedIntentHash = intentHash;
        approved = approval;
    }
    function verifyRegistration(bytes32 intentHash, bytes calldata) external view returns (bool) {
        return approved && intentHash == expectedIntentHash;
    }
}
