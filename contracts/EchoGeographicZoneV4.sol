// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EchoGeographicZoneV4
/// @notice Geographic zone encoding and deterministic hashing.
/// @dev Development component for The Original Echo Protocol Z.
library EchoGeographicZoneV4 {
    bytes32 internal constant ZONE_DOMAIN =
        keccak256("ECHO_V4_GEOGRAPHIC_ZONE_V1");

    uint32 internal constant MAX_LAT = 1800000000;
    uint32 internal constant MAX_LON = 3600000000;

    error InvalidLatitude();
    error InvalidLongitude();
    error InvalidZoneBoundaries();

    struct Zone {
        uint32 minLat;
        uint32 maxLat;
        uint32 minLon;
        uint32 maxLon;
    }

    function validate(Zone memory zone) internal pure {
        if (zone.minLat > MAX_LAT || zone.maxLat > MAX_LAT) {
            revert InvalidLatitude();
        }

        if (zone.minLon > MAX_LON || zone.maxLon > MAX_LON) {
            revert InvalidLongitude();
        }

        if (
            zone.minLat > zone.maxLat ||
            zone.minLon > zone.maxLon
        ) {
            revert InvalidZoneBoundaries();
        }
    }

    function hash(Zone memory zone)
        internal
        pure
        returns (bytes32)
    {
        validate(zone);

        return keccak256(
            abi.encode(
                ZONE_DOMAIN,
                zone.minLat,
                zone.maxLat,
                zone.minLon,
                zone.maxLon
            )
        );
    }
}
