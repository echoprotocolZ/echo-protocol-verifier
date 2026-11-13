// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoV4AdminIntent.sol";

interface IEchoAuthorizationBridgeForAccountV4 {
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
        uint[2] calldata v3A,
        uint[2][2] calldata v3B,
        uint[2] calldata v3C,
        uint[20] calldata v3Signals,
        uint[2] calldata v4A,
        uint[2][2] calldata v4B,
        uint[2] calldata v4C,
        uint[5] calldata v4Signals,
        address target,
        uint256 value,
        bytes calldata callData,
        uint256 expectedNonce
    ) external returns (bool);

    function checkpointRegistry() external view returns (address);
    function dualProofVerifier() external view returns (address);
}

contract EchoSmartAccountV4 {
    address public owner;
    address public pendingOwner;
    address public entryPoint;
    IEchoAuthorizationBridgeForAccountV4 public immutable authorizationBridge;

    uint256 public nonce;
    uint256 internal executionLock;

    event Executed(address indexed target, uint256 value, bytes data, uint256 nonce);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event EntryPointUpdated(address indexed previousEntryPoint, address indexed newEntryPoint);

    error Unauthorized();
    error InvalidAddress();
    error AuthorizationFailed();
    error ExecutionFailed(bytes reason);

    constructor(address owner_, address entryPoint_, address bridge_) {
        if (owner_ == address(0) || bridge_.code.length == 0) revert InvalidAddress();
        owner = owner_;
        entryPoint = entryPoint_;
        authorizationBridge = IEchoAuthorizationBridgeForAccountV4(bridge_);
    }

    modifier nonReentrantExecution() {
        if (executionLock != 0 || _isProofAdministrationLocked()) revert Unauthorized();
        executionLock = 1;
        _;
        executionLock = 0;
    }

    /// @dev Derived accounts may block execution during proof administration.\n    function _isProofAdministrationLocked() internal view virtual returns (bool) {\n        return false;\n    }\n\n    function executeAuthorized(
        IEchoAuthorizationBridgeForAccountV4.SignedCheckpoint calldata checkpoint,
        bytes calldata signature,
        uint[2] calldata v3A,
        uint[2][2] calldata v3B,
        uint[2] calldata v3C,
        uint[20] calldata v3Signals,
        uint[2] calldata v4A,
        uint[2][2] calldata v4B,
        uint[2] calldata v4C,
        uint[5] calldata v4Signals,
        address target,
        uint256 value,
        bytes calldata data
    ) external nonReentrantExecution returns (bytes memory result) {
        if (
            msg.sender != owner &&
            (entryPoint == address(0) || msg.sender != entryPoint) &&
            msg.sender != checkpoint.delegatee
        ) revert Unauthorized();

        if (checkpoint.account != address(this)) revert Unauthorized();

        address registry = authorizationBridge.checkpointRegistry();
        address dualVerifier = authorizationBridge.dualProofVerifier();

        (bool ok, bytes memory response) = dualVerifier.staticcall(
            abi.encodeWithSignature("v4Gateway()")
        );
        if (!ok || response.length != 32) revert InvalidAddress();

        address gateway = abi.decode(response, (address));
        if (gateway.code.length == 0) revert InvalidAddress();

        (ok, response) = gateway.staticcall(
            abi.encodeWithSignature("policyRegistry()")
        );
        if (!ok || response.length != 32) revert InvalidAddress();

        address policyRegistry = abi.decode(response, (address));
        if (policyRegistry.code.length == 0) revert InvalidAddress();

        if (
            target == address(0) ||
            target == address(this) ||
            target == address(authorizationBridge) ||
            target == registry ||
            target == dualVerifier ||
            target == gateway ||
            target == policyRegistry
        ) revert InvalidAddress();

        _validateExecutionPolicy(
            checkpoint.delegatee,
            target,
            value,
            data
        );

        uint256 currentNonce = nonce;

        bool authorized = authorizationBridge.authorize(
            checkpoint, signature,
            v3A, v3B, v3C, v3Signals,
            v4A, v4B, v4C, v4Signals,
            target, value, data, currentNonce
        );

        if (!authorized) revert AuthorizationFailed();

        nonce = currentNonce + 1;

        _beforeAuthorizedExecution(
            checkpoint.delegatee,
            target,
            value,
            data
        );

        bytes memory output = _performAuthorizedCall(
            checkpoint.delegatee,
            target,
            value,
            data
        );

        _afterAuthorizedExecution(
            checkpoint.delegatee,
            target,
            value,
            data
        );

        emit Executed(target, value, data, currentNonce);
        return output;
    }



    /// @dev Default V4 execution; Z may override for atomic staking.
    function _performAuthorizedCall(
        address delegatee,
        address target,
        uint256 value,
        bytes calldata data
    ) internal virtual returns (bytes memory) {
        delegatee;
        (bool success, bytes memory output) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed(output);
        return output;
    }

    /// @dev Extension point for stateful account-specific execution checks.
    /// Legacy V4 behavior remains unchanged.
    function _beforeAuthorizedExecution(
        address delegatee,
        address target,
        uint256 value,
        bytes calldata data
    ) internal virtual {
        delegatee;
        target;
        value;
        data;
    }

    /// @dev Post-execution extension point for account-specific
    /// accounting. Legacy V4 behavior remains unchanged.
    function _afterAuthorizedExecution(
        address delegatee,
        address target,
        uint256 value,
        bytes calldata data
    ) internal virtual {
        delegatee;
        target;
        value;
        data;
    }

    /// @dev Extension point for stricter account-specific
    /// execution policies. Legacy V4 behavior is unchanged.
    function _validateExecutionPolicy(
        address delegatee,
        address target,
        uint256 value,
        bytes calldata data
    ) internal view virtual {
        delegatee;
        target;
        value;
        data;
    }

    /// @notice Preview the exact domain-separated ownership intent bytes.
    /// @dev Read-only helper. This does not grant ownership or consume proofs.
    ///      The future proof-authorized entrypoint must verify this payload
    ///      through the bridge before changing pendingOwner.
    function ownershipProposalIntent(
        address successor,
        uint256 deadline
    ) external view returns (bytes memory) {
        return EchoV4AdminIntent.ownershipProposalPayload(
            address(this),
            successor,
            block.chainid,
            nonce,
            deadline
        );
    }

    /// @notice Disabled until proof-bound administration is implemented.
    function executeAdministration(
        address destination,
        bytes calldata data
    ) external nonReentrantExecution returns (bytes memory result) {
        destination;
        data;
        revert Unauthorized();
    }

    /// @notice Owner-only geographic policy administration.
    /// @dev Resolves the policy registry through immutable V4 dependencies.
    /// @notice Disabled until proof-bound geographic administration is implemented.
    function executeGeographicAdministration(
        bytes calldata data
    ) external nonReentrantExecution returns (bytes memory result) {
        data;
        revert Unauthorized();
    }

    function setEntryPoint(address newEntryPoint) external {
        newEntryPoint;
        revert Unauthorized();
    }

    function transferOwnership(address newOwner) external {
        newOwner;
        revert Unauthorized();
    }

    function acceptOwnership() external {
        revert Unauthorized();
    }

    receive() external payable {}
}
