// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Local security testing only. Not for production deployment.
contract EchoReentrancyProbeV3 {
    address public immutable account;
    bool public callbackSucceeded;
    bytes public callbackResult;

    event CallbackAttempted(bool success, bytes result);

    constructor(address accountAddress) {
        require(accountAddress != address(0), "Invalid account");
        account = accountAddress;
    }

    function attemptCallback(bytes calldata encodedCall) external {
        (bool success, bytes memory result) = account.call(encodedCall);

        callbackSucceeded = success;
        callbackResult = result;

        emit CallbackAttempted(success, result);
    }
}
