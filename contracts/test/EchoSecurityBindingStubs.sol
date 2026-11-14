// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Dependencies used only to deploy the V3 bridge for public-signal binding tests.
// No proof-verification success is implied by these mocks.
contract EchoSecurityVerifierStub {
    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[20] calldata
    ) external pure returns (bool) { return false; }
}
contract EchoSecurityRegistryStub {
    function checkpointDigest(bytes calldata) external pure returns (bytes32) {
        return bytes32(0);
    }
}
