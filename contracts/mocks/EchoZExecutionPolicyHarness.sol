// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../EchoSmartAccountZ.sol";

/// @notice Test-only harness exposing Z's real policy gate.
/// @dev This does not bypass the production executeAuthorized proof checks.
contract EchoZExecutionPolicyHarness is EchoSmartAccountZ {
    constructor(address owner_, address bridge_, address factory_)
        EchoSmartAccountZ(owner_, address(0), bridge_, factory_) {}

    function checkExecutionPolicy(
        address delegatee, address target, uint256 value, bytes calldata data
    ) external view {
        _validateExecutionPolicy(delegatee, target, value, data);
    }
}
