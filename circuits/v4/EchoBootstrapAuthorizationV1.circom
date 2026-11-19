pragma circom 2.2.2;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";

// EXPERIMENTAL / LOCAL ONLY.
// Proves knowledge of an enrollment secret matching a publicly pinned root.
// The contract MUST independently pin and authenticate trustedRoot; never
// accept a caller-chosen root. actionHash must be computed by the contract
// from exact operation type, account, registry, parameters and deadline.
// This circuit alone does NOT implement account bootstrap or root recovery.
template EchoBootstrapAuthorizationV1() {
    signal input trustedRoot;   // public, pinned by account
    signal input account;       // public
    signal input chainId;       // public
    signal input bootstrapNonce;// public
    signal input actionHash;    // public, canonical operation commitment
    signal input expectedNullifier; // public

    signal input enrollmentSecret; // private
    signal input enrollmentSalt;   // private

    // Prevent trivial zero-secret enrollment; enrollment root provenance
    // must still be authenticated outside the circuit.
    component secretBits = Num2Bits(248);
    secretBits.in <== enrollmentSecret;
    component saltBits = Num2Bits(248);
    saltBits.in <== enrollmentSalt;

    component root = Poseidon(2);
    root.inputs[0] <== enrollmentSecret;
    root.inputs[1] <== enrollmentSalt;
    root.out === trustedRoot;

    component nullifier = Poseidon(5);
    nullifier.inputs[0] <== enrollmentSecret;
    nullifier.inputs[1] <== account;
    nullifier.inputs[2] <== chainId;
    nullifier.inputs[3] <== bootstrapNonce;
    nullifier.inputs[4] <== actionHash;
    nullifier.out === expectedNullifier;
}

component main { public [
    trustedRoot, account, chainId, bootstrapNonce, actionHash,
    expectedNullifier
] } = EchoBootstrapAuthorizationV1();
