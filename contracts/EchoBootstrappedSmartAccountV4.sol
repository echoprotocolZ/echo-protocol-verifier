// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoSmartAccountV4.sol";
import "./EchoGeographicZoneV4.sol";

interface IEchoBootstrapBridgeV4 {
    function checkpointRegistry() external view returns (address);
    function dualProofVerifier() external view returns (address);
    function setAuthorizedDelegatee(address delegatee, bool authorized) external;
}
interface IEchoBootstrapDualVerifierV4 {
    function v4Gateway() external view returns (address);
}
interface IEchoBootstrapGatewayV4 {
    function policyRegistry() external view returns (address);
}
interface IEchoBootstrapRegistryV3 {
    struct AttestationPolicy {
        bytes32 allowedZoneHash;
        uint64 maxTimeDrift;
        uint8 requiredTier;
        bool allowValidatorFallback;
        bool enabled;
    }
    function setCheckpointBridge(address bridge, bool authorized) external;
    function setValidatorSigner(address signer, bool trusted) external;
    function setAttestationPolicy(address delegatee, AttestationPolicy calldata policy) external;
}
interface IEchoBootstrapGeographicRegistryV4 {
    function setGeographicPolicy(address delegatee, EchoGeographicZoneV4.Zone calldata zone) external;
}

/// @notice Opt-in deployment-time bootstrap; no post-deployment initializer.
/// @dev The deployer chooses the initial configuration. This is NOT proof-authorized
///      administration. Verify deployment parameters and deployer trust separately.
contract EchoBootstrappedSmartAccountV4 is EchoSmartAccountV4 {
    error InvalidBootstrapConfiguration();

    event BootstrapCompleted(address indexed account, address indexed delegatee, address indexed validator);

    constructor(
        address owner_,
        address entryPoint_,
        address bridge_,
        address delegatee_,
        address validator_,
        EchoGeographicZoneV4.Zone memory zone_,
        uint64 maxTimeDrift_
    ) EchoSmartAccountV4(owner_, entryPoint_, bridge_) {
        if (
            delegatee_ == address(0) ||
            validator_ == address(0) ||
            maxTimeDrift_ == 0
        ) revert InvalidBootstrapConfiguration();

        IEchoBootstrapBridgeV4 bridge = IEchoBootstrapBridgeV4(bridge_);
        address registryAddress = bridge.checkpointRegistry();
        address dualAddress = bridge.dualProofVerifier();
        if (registryAddress.code.length == 0 || dualAddress.code.length == 0) {
            revert InvalidBootstrapConfiguration();
        }
        address gatewayAddress = IEchoBootstrapDualVerifierV4(dualAddress).v4Gateway();
        if (gatewayAddress.code.length == 0) revert InvalidBootstrapConfiguration();
        address geographicAddress = IEchoBootstrapGatewayV4(gatewayAddress).policyRegistry();
        if (geographicAddress.code.length == 0) revert InvalidBootstrapConfiguration();

        bytes32 zoneHash = EchoGeographicZoneV4.hash(zone_);
        if (zoneHash == bytes32(0)) revert InvalidBootstrapConfiguration();

        // These calls execute with msg.sender == this account, while it is
        // being constructed. Any failure reverts the entire deployment.
        IEchoBootstrapRegistryV3 registry = IEchoBootstrapRegistryV3(registryAddress);
        registry.setCheckpointBridge(bridge_, true);
        registry.setValidatorSigner(validator_, true);
        registry.setAttestationPolicy(
            delegatee_,
            IEchoBootstrapRegistryV3.AttestationPolicy({
                allowedZoneHash: zoneHash,
                maxTimeDrift: maxTimeDrift_,
                requiredTier: 0,
                allowValidatorFallback: false,
                enabled: true
            })
        );
        IEchoBootstrapGeographicRegistryV4(geographicAddress).setGeographicPolicy(delegatee_, zone_);
        bridge.setAuthorizedDelegatee(delegatee_, true);
        emit BootstrapCompleted(address(this), delegatee_, validator_);
    }
}
