// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoGeographicZoneV4.sol";

/// @title EchoGeographicPolicyRegistryV4
/// @notice Account-controlled geographic policies.
/// @dev Development component for The Original Echo Protocol Z.
contract EchoGeographicPolicyRegistryV4 {
    struct GeographicPolicy {
        EchoGeographicZoneV4.Zone zone;
        bytes32 zoneHash;
        bool enabled;
    }

    mapping(address => mapping(address => GeographicPolicy))
        private _policies;

    event GeographicPolicyUpdated(
        address indexed account,
        address indexed delegatee,
        bytes32 zoneHash,
        bool enabled
    );

    error InvalidDelegatee();
    error GeographicPolicyDisabled();
    error GeographicZoneMismatch();

    function setGeographicPolicy(
        address delegatee,
        EchoGeographicZoneV4.Zone calldata zone
    ) external {
        if (delegatee == address(0)) revert InvalidDelegatee();

        EchoGeographicZoneV4.Zone memory copiedZone = zone;
        bytes32 computedHash = EchoGeographicZoneV4.hash(copiedZone);

        _policies[msg.sender][delegatee] = GeographicPolicy({
            zone: copiedZone,
            zoneHash: computedHash,
            enabled: true
        });

        emit GeographicPolicyUpdated(
            msg.sender,
            delegatee,
            computedHash,
            true
        );
    }

    function disableGeographicPolicy(address delegatee) external {
        if (delegatee == address(0)) revert InvalidDelegatee();

        GeographicPolicy storage policy =
            _policies[msg.sender][delegatee];

        policy.enabled = false;

        emit GeographicPolicyUpdated(
            msg.sender,
            delegatee,
            policy.zoneHash,
            false
        );
    }

    function getGeographicPolicy(
        address account,
        address delegatee
    ) external view returns (GeographicPolicy memory) {
        return _policies[account][delegatee];
    }

    function validateApprovedZone(
        address account,
        address delegatee,
        bytes32 expectedZoneHash
    ) external view returns (bool) {
        GeographicPolicy storage policy =
            _policies[account][delegatee];

        if (!policy.enabled) revert GeographicPolicyDisabled();

        if (policy.zoneHash != expectedZoneHash) {
            revert GeographicZoneMismatch();
        }

        return true;
    }
}
