// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract EchoReentryProbe {
    address public account;
    bytes public payload;
    bool public attempted;
    bool public blocked;
    function configure(address account_, bytes calldata payload_) external {
        account=account_;
        payload=payload_;
        attempted=false;
        blocked=false;
    }
    function trigger() external {
        attempted=true;
        (bool ok,)=account.call(payload);
        blocked=!ok;
        require(!ok,"REENTRY_SUCCEEDED");
    }
}
