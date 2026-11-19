// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice LOCAL-ONLY PROTOTYPE. Do not deploy or fund without approved policy and audit.
/// @dev One irrevocable, fully-funded grant per contract. A "month" is provisionally 30 days.
///      First tranche at start + 13*30 days; last at start + 48*30 days.
contract EchoFounderVestingPrototype {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable beneficiary;
    uint64 public immutable start;
    uint256 public immutable grant;
    uint256 public claimed;

    uint256 public constant MONTH = 30 days;
    uint256 public constant CLIFF_MONTHS = 12;
    uint256 public constant RELEASE_MONTHS = 36;

    event Claimed(address indexed beneficiary, uint256 amount);

    constructor(IERC20 token_, address beneficiary_, uint64 start_, uint256 grant_) {
        require(address(token_) != address(0) && address(token_).code.length != 0, "invalid token");
        require(beneficiary_ != address(0), "invalid beneficiary");
        require(start_ >= block.timestamp, "start in past");
        require(grant_ > 0, "zero grant");
        token = token_;
        beneficiary = beneficiary_;
        start = start_;
        grant = grant_;
    }

    function vestedAt(uint256 timestamp) public view returns (uint256) {
        uint256 firstRelease = uint256(start) + (CLIFF_MONTHS + 1) * MONTH;
        if (timestamp < firstRelease) return 0;
        uint256 elapsedMonths = (timestamp - uint256(start)) / MONTH;
        uint256 released = elapsedMonths - CLIFF_MONTHS;
        if (released >= RELEASE_MONTHS) return grant;
        return (grant * released) / RELEASE_MONTHS;
    }

    function claimable() public view returns (uint256) {
        return vestedAt(block.timestamp) - claimed;
    }

    function claim() external {
        require(msg.sender == beneficiary, "not beneficiary");
        uint256 amount = claimable();
        require(amount > 0, "nothing claimable");
        claimed += amount;
        token.safeTransfer(beneficiary, amount);
        emit Claimed(beneficiary, amount);
    }
}
