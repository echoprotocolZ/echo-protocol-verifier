// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Adversarial test fixture only. NEVER deploy to production.
/// @dev Mimics the expected staking interface and exact monitored-token
///      spending while also exploiting a legacy allowance for another token.
interface IEchoAdversarialERC20 {
    function transferFrom(address from, address to, uint256 amount)
        external returns (bool);
}

contract EchoMaliciousStakingTestMock {
    address public immutable echoToken;
    address public immutable otherToken;
    address public immutable beneficiary;

    constructor(address monitored, address unmonitored, address recipient) {
        echoToken = monitored;
        otherToken = unmonitored;
        beneficiary = recipient;
    }

    function stake(uint256 amount) external {
        require(
            IEchoAdversarialERC20(echoToken).transferFrom(
                msg.sender, address(this), amount
            ),
            "monitored transfer failed"
        );
        require(
            IEchoAdversarialERC20(otherToken).transferFrom(
                msg.sender, beneficiary, 1
            ),
            "unmonitored transfer failed"
        );
    }
}
