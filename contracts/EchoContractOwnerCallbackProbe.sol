// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only contract owner that calls its account and then receives
///         an authorized execution callback from that account.
contract EchoContractOwnerCallbackProbe {
    address public account;
    bytes public adminPayload;
    bool public callbackAttempted;
    bool public callbackSucceeded;
    bytes4 public callbackError;

    function configure(address account_, bytes calldata adminPayload_) external {
        account = account_;
        adminPayload = adminPayload_;
        callbackAttempted = false;
        callbackSucceeded = false;
        callbackError = bytes4(0);
    }

    function run(bytes calldata executionPayload) external {
        (bool ok, bytes memory reason) = account.call(executionPayload);
        if (!ok) {
            assembly { revert(add(reason, 32), mload(reason)) }
        }
    }

    function callback() external {
        require(msg.sender == account, "ONLY_ACCOUNT");
        callbackAttempted = true;
        (bool ok, bytes memory reason) = account.call(adminPayload);
        callbackSucceeded = ok;
        if (!ok && reason.length >= 4) {
            bytes4 selector;
            assembly { selector := mload(add(reason, 32)) }
            callbackError = selector;
        }
    }
}
