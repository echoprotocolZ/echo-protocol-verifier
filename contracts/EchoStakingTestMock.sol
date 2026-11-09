// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Local integration testing only. Never deploy to Mainnet.
contract EchoStakingTestMock {
    using SafeERC20 for IERC20;

    IERC20 public immutable echoToken;

    uint256 public constant MIN_STAKE = 1000 ether;
    uint256 public constant LOCK_PERIOD = 90 days;
    uint256 public constant UNBONDING_PERIOD = 1 days;

    struct Validator {
        uint256 stakedAmount;
        uint256 unlockTime;
        uint256 unstakeRequestedAt;
    }

    mapping(address => Validator) public validators;

    constructor(address token) {
        require(token != address(0), "Invalid token");
        echoToken = IERC20(token);
    }

    function stake(uint256 amount) external {
        require(amount >= MIN_STAKE, "Below minimum");
        echoToken.safeTransferFrom(msg.sender, address(this), amount);

        Validator storage v = validators[msg.sender];
        v.stakedAmount += amount;
        v.unlockTime = block.timestamp + LOCK_PERIOD;
        v.unstakeRequestedAt = 0;
    }

    function requestUnstake() external {
        Validator storage v = validators[msg.sender];
        require(v.stakedAmount > 0, "Nothing staked");
        require(block.timestamp >= v.unlockTime, "Still locked");
        v.unstakeRequestedAt = block.timestamp;
    }

    function withdraw(uint256 amount) external {
        Validator storage v = validators[msg.sender];
        require(v.unstakeRequestedAt != 0, "Unstake not requested");
        require(
            block.timestamp >= v.unstakeRequestedAt + UNBONDING_PERIOD,
            "Unbonding"
        );
        require(amount > 0 && amount <= v.stakedAmount, "Invalid amount");

        v.stakedAmount -= amount;
        v.unstakeRequestedAt = 0;

        echoToken.safeTransfer(msg.sender, amount);
    }

    function getValidatorStake(address validator)
        external view returns (uint256)
    {
        return validators[validator].stakedAmount;
    }
}
