// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Local testing only. Not for Mainnet deployment.
contract EchoTokenTestMock is ERC20 {
    constructor() ERC20("ECHO Test Token", "tECHO") {
        _mint(msg.sender, 100_000_000 * 10 ** decimals());
    }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }
}
