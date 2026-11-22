// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
interface IEchoStakingContractCaller { function stake(uint256 amount) external; }
/// @notice Local contract-wallet simulator; NOT EchoSmartAccountZ or a proof verifier.
contract EchoStakingContractCallerFixture {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    IEchoStakingContractCaller public immutable staking;
    constructor(address token_, address staking_) {
        token = IERC20(token_);
        staking = IEchoStakingContractCaller(staking_);
    }
    function stakeExact(uint256 amount) external {
        token.forceApprove(address(staking), amount);
        staking.stake(amount);
        token.forceApprove(address(staking), 0);
        require(token.allowance(address(this), address(staking)) == 0, "Residual allowance");
    }
}
