// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEchoAuthorizationBridgeV2 {
    function authorize(
        uint[2] calldata proofA,
        uint[2][2] calldata proofB,
        uint[2] calldata proofC,
        uint[17] calldata signals,
        address target,
        uint256 value,
        bytes calldata callData,
        uint256 expectedNonce
    ) external returns (bool);
}

contract EchoSmartAccountV2 {
    address public owner;
    address public entryPoint;
    IEchoAuthorizationBridgeV2 public immutable authorizationBridge;

    uint256 public nonce;

    event Executed(
        address indexed target,
        uint256 value,
        bytes data,
        uint256 nonce
    );

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    event EntryPointUpdated(
        address indexed previousEntryPoint,
        address indexed newEntryPoint
    );

    event AuthorizationBridgeUpdated(address indexed bridge);

    error Unauthorized();
    error InvalidAddress();
    error AuthorizationFailed();
    error ExecutionFailed(bytes reason);

    modifier onlyOwnerOrEntryPoint() {
        if (
            msg.sender != owner &&
            (entryPoint == address(0) || msg.sender != entryPoint)
        ) revert Unauthorized();
        _;
    }

    constructor(
        address _owner,
        address _entryPoint,
        address _authorizationBridge
    ) {
        if (
            _owner == address(0) ||
            _authorizationBridge == address(0)
        ) revert InvalidAddress();

        if (_authorizationBridge.code.length == 0) {
            revert InvalidAddress();
        }

        owner = _owner;
        entryPoint = _entryPoint;
        authorizationBridge =
            IEchoAuthorizationBridgeV2(_authorizationBridge);
    }

    /// @notice Verifies authorization before executing a transaction.
    /// @dev Authorization and execution occur atomically.
    function executeAuthorized(
        uint[2] calldata proofA,
        uint[2][2] calldata proofB,
        uint[2] calldata proofC,
        uint[17] calldata signals,
        address target,
        uint256 value,
        bytes calldata data
    )
        external
        onlyOwnerOrEntryPoint
        returns (bytes memory result)
    {
        uint256 currentNonce = nonce;

        bool authorized = authorizationBridge.authorize(
            proofA,
            proofB,
            proofC,
            signals,
            target,
            value,
            data,
            currentNonce
        );

        if (!authorized) revert AuthorizationFailed();

        nonce = currentNonce + 1;

        if (target == address(0)) revert InvalidAddress();

        bool success;
        (success, result) = target.call{value: value}(data);

        if (!success) revert ExecutionFailed(result);

        emit Executed(target, value, data, currentNonce);
    }

    // --- Administration ---

    function setEntryPoint(address newEntryPoint) external {
        if (msg.sender != owner) revert Unauthorized();

        emit EntryPointUpdated(entryPoint, newEntryPoint);
        entryPoint = newEntryPoint;
    }

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert Unauthorized();
        if (newOwner == address(0)) revert InvalidAddress();

        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    receive() external payable {}
    fallback() external payable {}
}

