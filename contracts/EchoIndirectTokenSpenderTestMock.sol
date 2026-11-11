// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Adversarial target for local-only indirect ERC-20 spending tests.
/// @dev Never deploy this contract to a production network.
contract EchoIndirectTokenSpenderTestMock {
    function pull(address token, address from, address recipient, uint256 amount) external {
        (bool ok, bytes memory response) = token.call(
            abi.encodeWithSelector(0x23b872dd, from, recipient, amount)
        );
        require(ok && (response.length == 0 ||
            (response.length == 32 && abi.decode(response, (bool)))), "PULL_FAILED");
    }
}
