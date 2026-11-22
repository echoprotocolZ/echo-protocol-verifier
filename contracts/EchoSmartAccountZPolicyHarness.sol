// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoSmartAccountZ.sol";

contract EchoSmartAccountZPolicyHarness is EchoSmartAccountZ {
    constructor(
        address owner_,
        address entryPoint_,
        address bridge_,
        address factory_
    ) EchoSmartAccountZ(owner_, entryPoint_, bridge_, factory_) {}

    function testValidateExecutionPolicy(
        address delegatee,
        address target,
        uint256 value,
        bytes calldata data
    ) external view {
        _validateExecutionPolicy(delegatee, target, value, data);
    }
}
