// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Local security testing only. Not for production deployment.
contract EchoReentrancyProbeV4 {
    address public immutable account;

    bool public callbackSucceeded;
    bytes public callbackResult;

    event CallbackAttempted(bool success, bytes result);

    constructor(address accountAddress) {
        require(accountAddress != address(0), "Invalid account");
        account = accountAddress;
    }

    /// @notice Initiates an administrative call as this contract.
    function initiate(bytes calldata encodedCall) external {
        (bool success, bytes memory result) = account.call(encodedCall);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    /// @notice Called by a test target during administration.
    /// Attempts to reenter the account and records the result.
    function attemptCallback(bytes calldata encodedCall) external {
        require(msg.sender == account, "Only account");

        (bool success, bytes memory result) = account.call(encodedCall);

        callbackSucceeded = success;
        callbackResult = result;

        emit CallbackAttempted(success, result);
    }
}
