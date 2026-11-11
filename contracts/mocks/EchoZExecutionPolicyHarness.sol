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
    /// @notice Isolates production balance hooks for an adversarial test.
    /// @dev Bypasses proof verification ONLY in this local test harness.
    function simulateAuthorizedCall(
        address delegatee, address target, bytes calldata data
    ) external returns (bytes memory result) {
        _beforeAuthorizedExecution(delegatee, target, 0, data);
        (bool ok, bytes memory output) = target.call(data);
        if (!ok) revert ExecutionFailed(output);
        _afterAuthorizedExecution(delegatee, target, 0, data);
        return output;
    }
    /// @notice Local fixture: set a monitored budget through the account's self-call.
    function fixtureSetBudget(address agent, address token, uint256 budget) external {
        this.setTokenSpendingBudget(agent, token, budget);
    }

    /// @notice Local fixture: reproduce a pre-existing allowance.
    function fixtureApprove(address token, address spender, uint256 amount) external {
        (bool ok, bytes memory response) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", spender, amount)
        );
        require(ok && (response.length == 0 ||
            (response.length == 32 && abi.decode(response, (bool)))), "APPROVE_FAILED");
    }
}
