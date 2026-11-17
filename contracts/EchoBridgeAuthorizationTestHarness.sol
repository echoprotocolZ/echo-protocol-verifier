// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Local-only dependency with deployed code; no proof verification capability.
contract EchoBridgeDependencyStub {
    function ping() external pure returns (bool) { return true; }
}

/// @notice Calls bridge on behalf of this contract to test msg.sender account binding.
contract EchoBridgeCallerHarness {
    function callBridge(address bridge, bytes calldata payload) external returns (bool, bytes memory) {
        return bridge.call(payload);
    }
    function setDelegatee(address bridge, address delegatee, bool allowed) external {
        (bool ok,) = bridge.call(abi.encodeWithSignature("setAuthorizedDelegatee(address,bool)",delegatee,allowed));
        require(ok,"delegatee update failed");
    }
}
