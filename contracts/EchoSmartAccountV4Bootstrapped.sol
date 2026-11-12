// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoSmartAccountV4.sol";
import "./EchoAttestationRegistryV3.sol";
import "./EchoGeographicPolicyRegistryV4.sol";
import "./EchoGeographicZoneV4.sol";

interface IEchoBootstrapDualV4 {
    function v4Gateway() external view returns (address);
}
interface IEchoBootstrapGatewayV4 {
    function policyRegistry() external view returns (address);
}

/// @notice Immutable, deployment-time policy bootstrap for a V4 account.
/// @dev Constructor calls originate from this account address; no impersonation,
///      EOA owner override, or post-deployment administrative backdoor.
///      Initial policy is intentionally self-delegated only.
///      Future policy changes require a separately audited proof-bound admin path.
contract EchoSmartAccountV4Bootstrapped is EchoSmartAccountV4 {
    error InvalidBootstrapDependency();

    event BootstrapCompleted(address indexed registry, address indexed geographicPolicyRegistry, address indexed validator);

    constructor(
        address owner_,
        address entryPoint_,
        address bridge_,
        address validator_,
        EchoGeographicZoneV4.Zone memory initialZone_,
        uint64 maxTimeDrift_
    ) EchoSmartAccountV4(owner_, entryPoint_, bridge_) {
        if (validator_ == address(0) || maxTimeDrift_ == 0) revert InvalidBootstrapDependency();

        address registryAddress = authorizationBridge.checkpointRegistry();
        address dualAddress = authorizationBridge.dualProofVerifier();
        if (registryAddress.code.length == 0 || dualAddress.code.length == 0) revert InvalidBootstrapDependency();

        address gatewayAddress = IEchoBootstrapDualV4(dualAddress).v4Gateway();
        if (gatewayAddress.code.length == 0) revert InvalidBootstrapDependency();

        address geoAddress = IEchoBootstrapGatewayV4(gatewayAddress).policyRegistry();
        if (geoAddress.code.length == 0) revert InvalidBootstrapDependency();

        EchoAttestationRegistryV3 registry = EchoAttestationRegistryV3(registryAddress);
        EchoGeographicPolicyRegistryV4 geo = EchoGeographicPolicyRegistryV4(geoAddress);

        // msg.sender in both registries is THIS contract, even during construction.
        geo.setGeographicPolicy(address(this), initialZone_);
        bytes32 zoneHash = EchoGeographicZoneV4.hash(initialZone_);

        registry.setCheckpointBridge(bridge_, true);
        registry.setValidatorSigner(validator_, true);
        registry.setAttestationPolicy(
            address(this),
            EchoAttestationRegistryV3.AttestationPolicy({
                allowedZoneHash: zoneHash,
                maxTimeDrift: maxTimeDrift_,
                requiredTier: EchoAttestationRegistryV3.AttestationTier.ValidatorOnly,
                allowValidatorFallback: false,
                enabled: true
            })
        );

        emit BootstrapCompleted(registryAddress, geoAddress, validator_);
    }
}
