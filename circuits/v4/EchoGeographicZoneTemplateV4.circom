pragma circom 2.2.2;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

template EchoGeographicZoneV4() {
    signal input checkpointLat;
    signal input checkpointLon;

    signal input minLat;
    signal input maxLat;
    signal input minLon;
    signal input maxLon;

    // Encoded GPS domain limits.
    component latBits = Num2Bits(32);
    latBits.in <== checkpointLat;

    component lonBits = Num2Bits(32);
    lonBits.in <== checkpointLon;

    component minLatBits = Num2Bits(32);
    minLatBits.in <== minLat;

    component maxLatBits = Num2Bits(32);
    maxLatBits.in <== maxLat;

    component minLonBits = Num2Bits(32);
    minLonBits.in <== minLon;

    component maxLonBits = Num2Bits(32);
    maxLonBits.in <== maxLon;

    // Domain bounds.
    component latDomain = LessEqThan(32);
    latDomain.in[0] <== checkpointLat;
    latDomain.in[1] <== 1800000000;
    latDomain.out === 1;

    component lonDomain = LessEqThan(32);
    lonDomain.in[0] <== checkpointLon;
    lonDomain.in[1] <== 3600000000;
    lonDomain.out === 1;

    component minLatDomain = LessEqThan(32);
    minLatDomain.in[0] <== minLat;
    minLatDomain.in[1] <== 1800000000;
    minLatDomain.out === 1;

    component maxLatDomain = LessEqThan(32);
    maxLatDomain.in[0] <== maxLat;
    maxLatDomain.in[1] <== 1800000000;
    maxLatDomain.out === 1;

    component minLonDomain = LessEqThan(32);
    minLonDomain.in[0] <== minLon;
    minLonDomain.in[1] <== 3600000000;
    minLonDomain.out === 1;

    component maxLonDomain = LessEqThan(32);
    maxLonDomain.in[0] <== maxLon;
    maxLonDomain.in[1] <== 3600000000;
    maxLonDomain.out === 1;

    // Zone membership (inclusive).
    component latMinCheck = LessEqThan(32);
    latMinCheck.in[0] <== minLat;
    latMinCheck.in[1] <== checkpointLat;
    latMinCheck.out === 1;

    component latMaxCheck = LessEqThan(32);
    latMaxCheck.in[0] <== checkpointLat;
    latMaxCheck.in[1] <== maxLat;
    latMaxCheck.out === 1;

    component lonMinCheck = LessEqThan(32);
    lonMinCheck.in[0] <== minLon;
    lonMinCheck.in[1] <== checkpointLon;
    lonMinCheck.out === 1;

    component lonMaxCheck = LessEqThan(32);
    lonMaxCheck.in[0] <== checkpointLon;
    lonMaxCheck.in[1] <== maxLon;
    lonMaxCheck.out === 1;
}
