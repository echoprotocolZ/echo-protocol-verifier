pragma circom 2.2.2;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

template EchoAuthorizationVerifierV3() {

    // Public authorization signals
    signal input expectedFragmentCommitment;
    signal input expectedAuthorizationCommitment;
    signal input expectedNullifier;

    signal input account;
    signal input delegatee;
    signal input validator;
    signal input target;
    signal input value;

    signal input calldataHashLow;
    signal input calldataHashHigh;

    signal input chainId;
    signal input nonce;
    signal input deadline;

    // Public geographic and time limits
    signal input targetX;
    signal input targetY;
    signal input maxDistanceSq;
    signal input minTimestamp;
    signal input maxTimestamp;

    signal input expectedCheckpointCommitment;
    signal input expectedCheckpointTimestamp;

    // Private fragment and checkpoint
    signal input fragmentPayload;
    signal input fragmentSalt;

    signal input checkpointX;
    signal input checkpointY;
    signal input checkpointTimestamp;

    // Fragment commitment
    component fragmentHash = Poseidon(2);
    fragmentHash.inputs[0] <== fragmentPayload;
    fragmentHash.inputs[1] <== fragmentSalt;

    expectedFragmentCommitment === fragmentHash.out;

    // Checkpoint commitment
    component checkpointHash = Poseidon(3);
    checkpointHash.inputs[0] <== checkpointX;
    checkpointHash.inputs[1] <== checkpointY;
    checkpointHash.inputs[2] <== checkpointTimestamp;

    expectedCheckpointCommitment === checkpointHash.out;
    checkpointTimestamp === expectedCheckpointTimestamp;

    // Authorization hash
    component authorizationHash1 = Poseidon(16);

    authorizationHash1.inputs[0] <== account;
    authorizationHash1.inputs[1] <== delegatee;
    authorizationHash1.inputs[2] <== validator;
    authorizationHash1.inputs[3] <== target;
    authorizationHash1.inputs[4] <== value;
    authorizationHash1.inputs[5] <== calldataHashLow;
    authorizationHash1.inputs[6] <== calldataHashHigh;
    authorizationHash1.inputs[7] <== chainId;
    authorizationHash1.inputs[8] <== nonce;
    authorizationHash1.inputs[9] <== deadline;
    authorizationHash1.inputs[10] <== fragmentHash.out;
    authorizationHash1.inputs[11] <== targetX;
    authorizationHash1.inputs[12] <== targetY;
    authorizationHash1.inputs[13] <== maxDistanceSq;
    authorizationHash1.inputs[14] <== minTimestamp;
    authorizationHash1.inputs[15] <== maxTimestamp;

    component authorizationHash2 = Poseidon(2);
    authorizationHash2.inputs[0] <== authorizationHash1.out;
    authorizationHash2.inputs[1] <== checkpointHash.out;

    expectedAuthorizationCommitment === authorizationHash2.out;

    // Nullifier
    component nullifierHash = Poseidon(2);
    nullifierHash.inputs[0] <== account;
    nullifierHash.inputs[1] <== authorizationHash2.out;

    expectedNullifier === nullifierHash.out;

    // Range-constrain geographic values
    component txBits = Num2Bits(32);
    component tyBits = Num2Bits(32);
    component cxBits = Num2Bits(32);
    component cyBits = Num2Bits(32);

    txBits.in <== targetX;
    tyBits.in <== targetY;
    cxBits.in <== checkpointX;
    cyBits.in <== checkpointY;

    component radiusBits = Num2Bits(64);
    radiusBits.in <== maxDistanceSq;

    // Squared Euclidean distance
    signal dx;
    signal dy;
    signal distanceSq;

    dx <== checkpointX - targetX;
    dy <== checkpointY - targetY;

    signal dxSquared;
    signal dySquared;

    dxSquared <== dx * dx;
    dySquared <== dy * dy;
    distanceSq <== dxSquared + dySquared;

    // Distance is bounded by the 32-bit coordinates
    component distanceBits = Num2Bits(65);
    distanceBits.in <== distanceSq;

    component distanceCheck = LessEqThan(65);
    distanceCheck.in[0] <== distanceSq;
    distanceCheck.in[1] <== maxDistanceSq;
    distanceCheck.out === 1;

    // Time window
    component minTimeBits = Num2Bits(64);
    component maxTimeBits = Num2Bits(64);
    component checkpointTimeBits = Num2Bits(64);
    component deadlineBits = Num2Bits(64);

    minTimeBits.in <== minTimestamp;
    maxTimeBits.in <== maxTimestamp;
    checkpointTimeBits.in <== checkpointTimestamp;
    deadlineBits.in <== deadline;

    component afterStart = LessEqThan(64);
    afterStart.in[0] <== minTimestamp;
    afterStart.in[1] <== checkpointTimestamp;
    afterStart.out === 1;

    component beforeEnd = LessEqThan(64);
    beforeEnd.in[0] <== checkpointTimestamp;
    beforeEnd.in[1] <== maxTimestamp;
    beforeEnd.out === 1;

    component beforeDeadline = LessEqThan(64);
    beforeDeadline.in[0] <== checkpointTimestamp;
    beforeDeadline.in[1] <== deadline;
    beforeDeadline.out === 1;
}

// Candidate V3 interface aligned with Solidity bridge indices.
// This changes the circuit ABI and requires NEW trusted setup and verifier.
component main {
    public [
        expectedFragmentCommitment,
        expectedAuthorizationCommitment,
        expectedNullifier,
        account,
        delegatee,
        validator,
        target,
        value,
        calldataHashLow,
        calldataHashHigh,
        chainId,
        nonce,
        deadline,
        targetX,
        targetY,
        maxDistanceSq,
        minTimestamp,
        maxTimestamp,
        expectedCheckpointCommitment,
        expectedCheckpointTimestamp
    ]
} = EchoAuthorizationVerifierV3();

