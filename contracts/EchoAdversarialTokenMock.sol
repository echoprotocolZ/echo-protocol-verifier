// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Adversarial ERC20 for local-only EchoStaking regression tests.
contract EchoAdversarialTokenMock is ERC20 {
    enum Mode { Normal, RevertTransferFrom, RevertTransfer, FeeTransferFrom, CallbackTransferFrom }
    Mode public mode;
    address public callbackTarget;
    bytes public callbackData;
    bool private inCallback;
    bool public callbackSucceeded;

    constructor() ERC20("Adversarial ECHO", "aECHO") { _mint(msg.sender, 10000000 ether); }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function setMode(Mode m) external { mode = m; }
    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
        callbackSucceeded = false;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (mode == Mode.RevertTransferFrom) revert("mock transferFrom reverted");
        if (mode == Mode.CallbackTransferFrom && !inCallback && callbackTarget != address(0)) {
            inCallback = true;
            (callbackSucceeded,) = callbackTarget.call(callbackData);
            inCallback = false;
        }
        if (mode == Mode.FeeTransferFrom) {
            // Sender pays full amount, recipient receives one token less.
            _spendAllowance(from, _msgSender(), value);
            _transfer(from, to, value - 1);
            _burn(from, 1);
            return true;
        }
        return super.transferFrom(from, to, value);
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (mode == Mode.RevertTransfer) revert("mock transfer reverted");
        return super.transfer(to, value);
    }
}
