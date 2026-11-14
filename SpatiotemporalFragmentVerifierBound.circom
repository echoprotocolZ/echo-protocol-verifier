pragma circom 2.2.2;

// Experimental hardened circuit. Not a replacement for deployed verifier keys.
// Requires fresh trusted setup, Solidity verifier, and integration tests.
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

template SpatiotemporalFragmentVerifierBound() {
    signal input expectedFragmentCommitment;
    signal input expectedCheckpointCommitment;
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

    component fragmentHash = Poseidon(2);
    fragmentHash.inputs[0] <== fragmentPayload;
    fragmentHash.inputs[1] <== fragmentSalt;
    fragmentHash.out === expectedFragmentCommitment;

    // This commitment MUST be authenticated by the validator's signed payload
    // and matched to this exact public signal by the Solidity bridge.
    // Domain/context binding is the responsibility of the signed payload.
    component checkpointHash = Poseidon(3);
    checkpointHash.inputs[0] <== checkpointX;
    checkpointHash.inputs[1] <== checkpointY;
    checkpointHash.inputs[2] <== checkpointTimestamp;
    checkpointHash.out === expectedCheckpointCommitment;

    // Explicit canonical unsigned coordinate and time ranges.
    component xBits = Num2Bits(32);
    xBits.in <== checkpointX;
    component yBits = Num2Bits(32);
    yBits.in <== checkpointY;
    component targetXBits = Num2Bits(32);
    targetXBits.in <== targetX;
    component targetYBits = Num2Bits(32);
    targetYBits.in <== targetY;
    component tBits = Num2Bits(64);
    tBits.in <== checkpointTimestamp;
    component minBits = Num2Bits(64);
    minBits.in <== minTimestamp;
    component maxBits = Num2Bits(64);
    maxBits.in <== maxTimestamp;

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
    signal distanceSq;
    dx <== checkpointX - targetX;
    dy <== checkpointY - targetY;
    distanceSq <== dx * dx + dy * dy;

    component distanceRange = Num2Bits(65);
    distanceRange.in <== distanceSq;
    component maxDistanceRange = Num2Bits(65);
    maxDistanceRange.in <== maxDistanceSq;
    component distanceBound = LessEqThan(65);
    distanceBound.in[0] <== distanceSq;
    distanceBound.in[1] <== maxDistanceSq;
    distanceBound.out === 1;
}

component main { public [
    expectedFragmentCommitment,
    expectedCheckpointCommitment,
    targetX,
    targetY,
    maxDistanceSq,
    minTimestamp,
    maxTimestamp
] } = SpatiotemporalFragmentVerifierBound();
