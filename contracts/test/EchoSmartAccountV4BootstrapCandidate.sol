// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../EchoSmartAccountV4.sol";
import "../EchoV4AdminIntent.sol";

interface IEchoBootstrapProofVerifier {
    /// @dev MUST independently authenticate the exact canonical intent bytes.
    /// A permissive mock is NOT suitable for production deployment.
    function verifyBootstrap(bytes calldata intent, bytes calldata proof) external view returns (bool);
}

interface IEchoBootstrapRegistry {
    function setCheckpointBridge(address bridge, bool authorized) external;
    function authorizedCheckpointBridges(address account, address bridge) external view returns (bool);
}

/// @notice EXPERIMENTAL local-only bootstrap candidate; NOT audited or deployment-ready.
/// @dev Separate account type: does not modify already deployed V4 bytecode.
///      Trust anchor is an immutable independent verifier, never the candidate bridge.
contract EchoSmartAccountV4BootstrapCandidate is EchoSmartAccountV4 {
    address public immutable bootstrapVerifier;
    uint256 public bootstrapNonce;
    bool public bootstrapComplete;
    uint256 private bootstrapLock;

    error InvalidBootstrap();
    error BootstrapExpired();
    error BootstrapUnauthorized();
    error BootstrapAlreadyComplete();
    event BootstrapRegistered(address indexed registry, address indexed bridge, uint256 indexed nonce);

    constructor(address owner_, address entryPoint_, address bridge_, address verifier_)
        EchoSmartAccountV4(owner_, entryPoint_, bridge_)
    {
        if (verifier_.code.length == 0) revert InvalidBootstrap();
        bootstrapVerifier = verifier_;
    }

    /// @dev One-time only; no generic call, revocation, or bridge replacement.
    ///      Proof verification MUST bind the complete canonical intent.
    function registerImmutableBridge(bytes calldata proof, uint256 deadline) external {
        if (bootstrapLock != 0 || executionLock != 0) revert BootstrapUnauthorized();
        if (bootstrapComplete) revert BootstrapAlreadyComplete();
        if (deadline == 0 || block.timestamp > deadline) revert BootstrapExpired();
        bootstrapLock = 1;

        address registry = authorizationBridge.checkpointRegistry();
        address bridge = address(authorizationBridge);
        if (registry.code.length == 0 || bridge.code.length == 0) revert InvalidBootstrap();

        bytes memory intent = EchoV4AdminIntent.bridgeRegistrationPayload(
            address(this), registry, bridge, true, block.chainid, bootstrapNonce, deadline
        );
        if (!IEchoBootstrapProofVerifier(bootstrapVerifier).verifyBootstrap(intent, proof))
            revert BootstrapUnauthorized();

        bootstrapNonce++;
        bootstrapComplete = true;
        IEchoBootstrapRegistry(registry).setCheckpointBridge(bridge, true);
        if (!IEchoBootstrapRegistry(registry).authorizedCheckpointBridges(address(this), bridge))
            revert InvalidBootstrap();

        bootstrapLock = 0;
        emit BootstrapRegistered(registry, bridge, bootstrapNonce - 1);
    }

    /// @dev Do not allow execution during bootstrap's external registry call.
    function _isProofAdministrationLocked() internal view override returns (bool) {
        return bootstrapLock != 0;
    }
}
