// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only runtime used to simulate registry failure.
contract EchoAlwaysRevertTest {
    fallback() external payable {
        revert("SIMULATED_GEOGRAPHIC_REGISTRY_FAILURE");
    }
}
