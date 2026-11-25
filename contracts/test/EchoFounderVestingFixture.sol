// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// TEST ONLY: supplied UTC anniversary timestamps are not independently
// calendar-validated. No production deployment or funding.
contract EchoFounderVestingFixture {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable beneficiary;
    uint256 public constant GRANT = 10_000_000 ether;
    uint256[37] public releaseTimes;
    uint256 public claimed;
    constructor(IERC20 t, address b, uint256[37] memory times) {
        require(address(t) != address(0) && b != address(0));
        require(times[0] > block.timestamp);
        for (uint256 i = 1; i < 37; i++) require(times[i] > times[i-1]);
        token = t;
        beneficiary = b;
        releaseTimes = times;
    }
    function vested() public view returns (uint256) {
        for (uint256 i = 37; i > 0; i--) {
            if (block.timestamp >= releaseTimes[i-1]) return GRANT * (i + 11) / 48;
        }
        return 0;
    }
    function claim() external {
        require(msg.sender == beneficiary, "beneficiary");
        uint256 amount = vested() - claimed;
        require(amount > 0, "nothing vested");
        claimed += amount;
        token.safeTransfer(beneficiary, amount);
    }
}
