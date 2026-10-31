pragma circom 2.2.2;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

template SpatiotemporalFragmentVerifier() {
    signal input expectedFragmentCommitment;
    signal input targetX;
    signal input targetY;
    signal input maxDistanceSq;
    signal input minTimestamp;
    signal input maxTimestamp;

    signal input fragmentPayload;
    signal input fragmentSalt;
    signal input checkpointX;
    signal input checkpointY;
    signal input checkpointTimestamp;

    component hash = Poseidon(2);
    hash.inputs[0] <== fragmentPayload;
    hash.inputs[1] <== fragmentSalt;
    hash.out === expectedFragmentCommitment;

    component timeMin = GreaterEqThan(64);
    timeMin.in[0] <== checkpointTimestamp;
    timeMin.in[1] <== minTimestamp;
    timeMin.out === 1;

    component timeMax = LessEqThan(64);
    timeMax.in[0] <== checkpointTimestamp;
    timeMax.in[1] <== maxTimestamp;
    timeMax.out === 1;

    signal dx;
    signal dy;
    signal dxSquared;
    signal dySquared;
    signal distanceSq;

    dx <== checkpointX - targetX;
    dy <== checkpointY - targetY;
    dxSquared <== dx * dx;
    dySquared <== dy * dy;
    distanceSq <== dxSquared + dySquared;

    component distanceBound = LessEqThan(65);
    distanceBound.in[0] <== distanceSq;
    distanceBound.in[1] <== maxDistanceSq;
    distanceBound.out === 1;

    component distanceRange = Num2Bits(65);
    distanceRange.in <== distanceSq;

    component maxDistanceRange = Num2Bits(65);
    maxDistanceRange.in <== maxDistanceSq;
}

component main { public [
    expectedFragmentCommitment,
    targetX,
    targetY,
    maxDistanceSq,
    minTimestamp,
    maxTimestamp
] } = SpatiotemporalFragmentVerifier();

