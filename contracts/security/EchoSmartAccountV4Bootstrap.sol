// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../EchoSmartAccountV4.sol";
import "../EchoV4AdminIntent.sol";

/// @notice Independent bootstrap proof verifier interface.
/// @dev The trusted implementation MUST verify a real cryptographic proof
///      whose public inputs bind the exact intentHash. Never use a mock
///      verifier in production.
interface IEchoV4BootstrapVerifier {
    function verifyRegistration(bytes32 intentHash, bytes calldata proof)
        external view returns (bool);
}

interface IEchoV3BridgeRegistration {
    function setCheckpointBridge(address bridge, bool authorized) external;
    function authorizedCheckpointBridges(address account, address bridge)
        external view returns (bool);
}

/// @notice NEW-DEPLOYMENT-ONLY prototype. Does not modify existing V4 accounts.
/// @dev Not production ready without a separately audited proof verifier,
///      circuit/public-signal linkage and positive/negative proof tests.
contract EchoSmartAccountV4Bootstrap is EchoSmartAccountV4 {
    IEchoV4BootstrapVerifier public immutable bootstrapVerifier;
    address public immutable bootstrapRegistry;
    uint256 public registrationNonce;
    uint256 private registrationLock;

    error InvalidBootstrapDependency();
    error BootstrapUnauthorized();
    error BootstrapExpired();
    error BootstrapReentrant();
    error BootstrapRegistryMismatch();

    event BootstrapRegistration(
        address indexed bridge, bool authorized, uint256 indexed nonce, bytes32 intentHash
    );

    constructor(
        address owner_,
        address entryPoint_,
        address bridge_,
        address registry_,
        address verifier_
    ) EchoSmartAccountV4(owner_, entryPoint_, bridge_) {
        if (registry_.code.length == 0 || verifier_.code.length == 0)
            revert InvalidBootstrapDependency();
        if (IEchoAuthorizationBridgeForAccountV4(bridge_).checkpointRegistry() != registry_)
            revert InvalidBootstrapDependency();
        bootstrapRegistry = registry_;
        bootstrapVerifier = IEchoV4BootstrapVerifier(verifier_);
    }

    /// @notice Exact scoped operation; no generic admin call or arbitrary bridge.
    /// @dev Permission comes solely from an independent cryptographic proof
    ///      verifier. Neither owner nor bridge may bypass that verification.
    function registerImmutableBridge(
        bool authorized,
        uint256 deadline,
        bytes calldata proof
    ) external {
        if (registrationLock != 0) revert BootstrapReentrant();
        registrationLock = 1;
        if (block.timestamp > deadline) revert BootstrapExpired();

        address bridge = address(authorizationBridge);
        uint256 currentNonce = registrationNonce;
        bytes32 intentHash = keccak256(
            EchoV4AdminIntent.bridgeRegistrationPayload(
                address(this), bootstrapRegistry, bridge, authorized,
                block.chainid, currentNonce, deadline
            )
        );

        if (!bootstrapVerifier.verifyRegistration(intentHash, proof))
            revert BootstrapUnauthorized();

        registrationNonce = currentNonce + 1;
        IEchoV3BridgeRegistration(bootstrapRegistry)
            .setCheckpointBridge(bridge, authorized);
        if (
            IEchoV3BridgeRegistration(bootstrapRegistry)
                .authorizedCheckpointBridges(address(this), bridge) != authorized
        ) revert BootstrapRegistryMismatch();

        emit BootstrapRegistration(bridge, authorized, currentNonce, intentHash);
        registrationLock = 0;
    }
}
