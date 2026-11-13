// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice TEST ONLY. Delegatecalls to a real registry while faulting one policy update.
/// @dev Uses immutable configuration to avoid colliding with registry storage.
contract EchoAttestationPolicyFaultProxy {
    address public immutable implementation;
    address public immutable blockedDelegatee;

    error InjectedAttestationPolicyFailure();

    constructor(address implementation_, address blockedDelegatee_) {
        require(implementation_.code.length > 0, "missing implementation");
        require(blockedDelegatee_ != address(0), "missing delegatee");
        implementation = implementation_;
        blockedDelegatee = blockedDelegatee_;
    }

    struct Policy { bytes32 allowedZoneHash; uint64 maxTimeDrift; uint8 requiredTier; bool allowValidatorFallback; bool enabled; }\n\n    // Exact selector of EchoAttestationRegistryV3.setAttestationPolicy.
    function setAttestationPolicy(
        address delegatee,
        Policy calldata policy
    ) external {
        if (delegatee == blockedDelegatee) revert InjectedAttestationPolicyFailure();
        (bool ok, bytes memory data) = implementation.delegatecall(msg.data);
        if (!ok) assembly { revert(add(data, 32), mload(data)) }
    }

    fallback() external payable {
        address target = implementation;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), target, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
