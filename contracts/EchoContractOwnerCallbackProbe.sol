// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only contract owner and execution target for cross-function callbacks.
contract EchoContractOwnerCallbackProbe {
    address public account;
    bytes public adminPayload;
    bool public attempted;
    bool public blocked;

    function configure(address account_, bytes calldata adminPayload_) external {
        account = account_;
        adminPayload = adminPayload_;
        attempted = false;
        blocked = false;
    }

    function run(bytes calldata executionPayload) external {
        (bool ok, bytes memory reason) = account.call(executionPayload);
        if (!ok) assembly { revert(add(reason, 32), mload(reason)) }
    }

    fallback() external payable {
        attempted = true;
        (bool ok,) = account.call(adminPayload);
        blocked = !ok;
        require(!ok, "CROSS_FUNCTION_REENTRY_SUCCEEDED");
    }
}
