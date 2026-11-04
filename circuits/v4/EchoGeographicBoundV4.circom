pragma circom 2.2.2;

include "EchoGeographicZoneTemplateV4.circom";
include "circomlib/circuits/poseidon.circom";

template EchoGeographicBoundV4() {
    signal input checkpointLat;
    signal input checkpointLon;
    signal input checkpointTimestamp;

    signal input minLat;
    signal input maxLat;
    signal input minLon;
    signal input maxLon;

    signal input expectedCheckpointCommitment;

    // Reuse the tested V4 geographic constraints.
    component geographic = EchoGeographicZoneV4();

    geographic.checkpointLat <== checkpointLat;
    geographic.checkpointLon <== checkpointLon;

    geographic.minLat <== minLat;
    geographic.maxLat <== maxLat;
    geographic.minLon <== minLon;
    geographic.maxLon <== maxLon;

    // Match the existing V3 checkpoint commitment formula.
    component checkpointHash = Poseidon(3);

    checkpointHash.inputs[0] <== checkpointLat;
    checkpointHash.inputs[1] <== checkpointLon;
    checkpointHash.inputs[2] <== checkpointTimestamp;

    expectedCheckpointCommitment === checkpointHash.out;
}

component main { public [
    minLat,
    maxLat,
    minLon,
    maxLon,
    expectedCheckpointCommitment
] } = EchoGeographicBoundV4();
