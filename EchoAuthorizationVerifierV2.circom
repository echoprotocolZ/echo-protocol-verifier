pragma circom 2.2.2;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

template EchoAuthorizationVerifierV2() {
    // Public authorization inputs
    signal input expectedFragmentCommitment;
    signal input expectedAuthorizationCommitment;
    signal input expectedNullifier;

    signal input account;
    signal input validator;
    signal input target;
    signal input value;

    signal input calldataHashLow;
    signal input calldataHashHigh;

    signal input chainId;
    signal input nonce;
    signal input deadline;

    // Public geographic and time restrictions
    signal input targetX;
    signal input targetY;
    signal input maxDistanceSq;
    signal input minTimestamp;
    signal input maxTimestamp;

    // Private witness inputs
    signal input fragmentPayload;
    signal input fragmentSalt;
    signal input checkpointX;
    signal input checkpointY;
    signal input checkpointTimestamp;

    // Address and integer range constraints
    component accountBits = Num2Bits(160);
    accountBits.in <== account;

    component validatorBits = Num2Bits(160);
    validatorBits.in <== validator;

    component targetBits = Num2Bits(160);
    targetBits.in <== target;

    component valueBits = Num2Bits(128);
    valueBits.in <== value;

    component calldataLowBits = Num2Bits(128);
    calldataLowBits.in <== calldataHashLow;

    component calldataHighBits = Num2Bits(128);
    calldataHighBits.in <== calldataHashHigh;

    component chainBits = Num2Bits(64);
    chainBits.in <== chainId;

    component nonceBits = Num2Bits(64);
    nonceBits.in <== nonce;

    component deadlineBits = Num2Bits(64);
    deadlineBits.in <== deadline;

    // Fragment commitment
    component fragmentHash = Poseidon(2);
    fragmentHash.inputs[0] <== fragmentPayload;
    fragmentHash.inputs[1] <== fragmentSalt;

    fragmentHash.out === expectedFragmentCommitment;

    // Bind transaction AND geographic/time restrictions
    component authorizationHash = Poseidon(15);

    authorizationHash.inputs[0] <== account;
    authorizationHash.inputs[1] <== validator;
    authorizationHash.inputs[2] <== target;
    authorizationHash.inputs[3] <== value;
    authorizationHash.inputs[4] <== calldataHashLow;
    authorizationHash.inputs[5] <== calldataHashHigh;
    authorizationHash.inputs[6] <== chainId;
    authorizationHash.inputs[7] <== nonce;
    authorizationHash.inputs[8] <== deadline;
    authorizationHash.inputs[9] <== expectedFragmentCommitment;
    authorizationHash.inputs[10] <== targetX;
    authorizationHash.inputs[11] <== targetY;
    authorizationHash.inputs[12] <== maxDistanceSq;
    authorizationHash.inputs[13] <== minTimestamp;
    authorizationHash.inputs[14] <== maxTimestamp;

    authorizationHash.out === expectedAuthorizationCommitment;

    // Authorization nullifier
    component nullifierHash = Poseidon(2);
    nullifierHash.inputs[0] <== account;
    nullifierHash.inputs[1] <== expectedAuthorizationCommitment;

    nullifierHash.out === expectedNullifier;

    // Geographic coordinate ranges
    component targetXBits = Num2Bits(32);
    targetXBits.in <== targetX;

    component targetYBits = Num2Bits(32);
    targetYBits.in <== targetY;

    component checkpointXBits = Num2Bits(32);
    checkpointXBits.in <== checkpointX;

    component checkpointYBits = Num2Bits(32);
    checkpointYBits.in <== checkpointY;

    // Absolute X difference
    component xLess = LessThan(32);
    xLess.in[0] <== checkpointX;
    xLess.in[1] <== targetX;

    signal dx;
    signal dxPart1;
    signal dxPart2;

    dxPart1 <== xLess.out * (targetX - checkpointX);
    dxPart2 <== (1 - xLess.out) * (checkpointX - targetX);
    dx <== dxPart1 + dxPart2;

    // Absolute Y difference
    component yLess = LessThan(32);
    yLess.in[0] <== checkpointY;
    yLess.in[1] <== targetY;

    signal dy;
    signal dyPart1;
    signal dyPart2;

    dyPart1 <== yLess.out * (targetY - checkpointY);
    dyPart2 <== (1 - yLess.out) * (checkpointY - targetY);
    dy <== dyPart1 + dyPart2;

    // Squared distance
    signal dxSquared;
    signal dySquared;
    signal distanceSq;

    dxSquared <== dx * dx;
    dySquared <== dy * dy;
    distanceSq <== dxSquared + dySquared;

    component distanceBits = Num2Bits(66);
    distanceBits.in <== distanceSq;

    component maxDistanceBits = Num2Bits(66);
    maxDistanceBits.in <== maxDistanceSq;

    component distanceCheck = LessEqThan(66);
    distanceCheck.in[0] <== distanceSq;
    distanceCheck.in[1] <== maxDistanceSq;
    distanceCheck.out === 1;

    // Timestamp ranges
    component timestampBits = Num2Bits(64);
    timestampBits.in <== checkpointTimestamp;

    component minTimestampBits = Num2Bits(64);
    minTimestampBits.in <== minTimestamp;

    component maxTimestampBits = Num2Bits(64);
    maxTimestampBits.in <== maxTimestamp;

    component timeMin = GreaterEqThan(64);
    timeMin.in[0] <== checkpointTimestamp;
    timeMin.in[1] <== minTimestamp;
    timeMin.out === 1;

    component timeMax = LessEqThan(64);
    timeMax.in[0] <== checkpointTimestamp;
    timeMax.in[1] <== maxTimestamp;
    timeMax.out === 1;
}

component main {
    public [
        expectedFragmentCommitment,
        expectedAuthorizationCommitment,
        expectedNullifier,
        account,
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
        maxTimestamp
    ]
} = EchoAuthorizationVerifierV2();

