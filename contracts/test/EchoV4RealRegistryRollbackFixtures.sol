// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../EchoSmartAccountV4.sol";
import "../EchoAttestationRegistryV3.sol";

/// @dev TEST-ONLY setup bypass. Never deploy or reuse for production.
contract EchoV4RegistryConfiguredTestAccount is EchoSmartAccountV4 {
    constructor(address owner_, address bridge_) EchoSmartAccountV4(owner_, address(0), bridge_) {}
    function configureTestRegistry(
        EchoAttestationRegistryV3 registry,
        address bridge,
        address validator,
        bytes32 zoneHash
    ) external {
        require(msg.sender == owner, "test owner only");
        registry.setCheckpointBridge(bridge, true);
        registry.setValidatorSigner(validator, true);
        registry.setAttestationPolicy(address(this), EchoAttestationRegistryV3.AttestationPolicy({
            allowedZoneHash: zoneHash,
            maxTimeDrift: 3600,
            requiredTier: EchoAttestationRegistryV3.AttestationTier.ValidatorOnly,
            allowValidatorFallback: false,
            enabled: true
        }));
    }
}

/// @dev TEST-ONLY proof stub. Not a Groth16 verifier.
contract EchoV4AlwaysTrueDualProofStub {
    address public immutable v4Gateway;
    constructor(address gateway_) { v4Gateway = gateway_; }
    function verifyDualProof(
        EchoAuthorizationBridgeForStubCheckpoint calldata,
        uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[20] calldata,
        uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[5] calldata
    ) external pure returns (bool) { return true; }
    struct EchoAuthorizationBridgeForStubCheckpoint {
        address account; address delegatee; bytes32 zoneHash; bytes32 checkpointCommitment;
        bytes32 authorizationCommitment; uint64 timestamp; uint256 nonce;
    }
}
contract EchoV4TestGatewayStub {
    address public immutable policyRegistry;
    constructor(address policy_) { policyRegistry = policy_; }
}
contract EchoV4TestPolicyStub {}
contract EchoV4TestToggleTarget {
    bool public shouldRevert = true;
    uint256 public calls;
    function setShouldRevert(bool value) external { shouldRevert = value; }
    function execute() external {
        calls++;
        require(!shouldRevert, "forced failure");
    }
}
