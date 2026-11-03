// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEchoAuthorizationBridgeV3 {
    struct SignedCheckpoint {
        address account;
        address delegatee;
        bytes32 zoneHash;
        bytes32 checkpointCommitment;
        bytes32 authorizationCommitment;
        uint64 timestamp;
        uint256 nonce;
    }

    function authorize(
        SignedCheckpoint calldata checkpoint,
        bytes calldata signature,
        uint[2] calldata proofA,
        uint[2][2] calldata proofB,
        uint[2] calldata proofC,
        uint[19] calldata signals,
        address target,
        uint256 value,
        bytes calldata callData,
        uint256 expectedNonce
    ) external returns (bool);
}

contract EchoSmartAccountV3 {
    address public owner;
    address public entryPoint;
    IEchoAuthorizationBridgeV3 public immutable authorizationBridge;

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
            IEchoAuthorizationBridgeV3(_authorizationBridge);
    }

    /// @notice Verifies authorization before executing a transaction.
    /// @dev Authorization and execution occur atomically.
    function executeAuthorized(
        IEchoAuthorizationBridgeV3.SignedCheckpoint calldata checkpoint,
        bytes calldata signature,
        uint[2] calldata proofA,
        uint[2][2] calldata proofB,
        uint[2] calldata proofC,
        uint[19] calldata signals,
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
            checkpoint,
            signature,
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

    /// @notice Owner-only configuration of approved protocol contracts.
    /// @dev Restricted to the registry and this account's authorization bridge.
    function executeAdministration(
        address destination,
        bytes calldata data
    ) external returns (bytes memory result) {
        if (msg.sender != owner) revert Unauthorized();

        address registry = address(0);
        (bool ok, bytes memory response) = address(authorizationBridge).staticcall(
            abi.encodeWithSignature("checkpointRegistry()")
        );
        if (!ok || response.length != 32) revert InvalidAddress();
        registry = abi.decode(response, (address));

        if (
            destination != registry &&
            destination != address(authorizationBridge)
        ) revert Unauthorized();

        (bool success, bytes memory output) = destination.call(data);
        if (!success) revert ExecutionFailed(output);

        return output;
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

