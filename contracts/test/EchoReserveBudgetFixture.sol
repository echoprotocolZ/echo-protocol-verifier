// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// Local test fixture only; not a production treasury or staking contract.
contract EchoReserveBudgetFixture {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable authority;
    uint256 public constant CAP = 20_000_000 ether;
    uint256 public immutable principal;
    uint256 public spent;
    constructor(IERC20 t, address a, uint256 p) {
        require(address(t) != address(0) && a != address(0));
        token = t; authority = a; principal = p;
    }
    function pay(address recipient, uint256 amount) external {
        require(msg.sender == authority, "authority");
        require(recipient != address(0) && recipient != address(this) && amount > 0, "payment");
        require(amount <= CAP - spent, "cap");
        uint256 balance = token.balanceOf(address(this));
        require(balance >= principal && amount <= balance - principal, "reserve");
        spent += amount;
        token.safeTransfer(recipient, amount);
    }
}
