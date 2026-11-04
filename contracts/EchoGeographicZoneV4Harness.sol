// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoGeographicZoneV4.sol";

contract EchoGeographicZoneV4Harness {
    function hashZone(
        EchoGeographicZoneV4.Zone memory zone
    ) external pure returns (bytes32) {
        return EchoGeographicZoneV4.hash(zone);
    }
}
