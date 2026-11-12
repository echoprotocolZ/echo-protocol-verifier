// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice TEST ONLY. Returns true for all proof verification requests.
/// @dev This does not validate Groth16 proofs and must never be deployed.
contract EchoAlwaysTrueDualProofTestMock {
    fallback(bytes calldata input) external returns (bytes memory) {
        input;
        return abi.encode(true);
    }
}
