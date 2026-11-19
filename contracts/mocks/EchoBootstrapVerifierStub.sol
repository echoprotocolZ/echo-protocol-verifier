// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only verifier: accepts a chosen marker, not cryptographic proof.
/// Never use as a production verifier.
contract EchoBootstrapVerifierStub {
    bool public accept;
    constructor(bool accept_) { accept = accept_; }
    function setAccept(bool accept_) external { accept = accept_; }
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[6] calldata
    ) external view returns (bool) { return accept; }
}
