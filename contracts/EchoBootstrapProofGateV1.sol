// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Read-only Groth16 bootstrap proof gate; never grants account administration.
/// @dev The deployment must pin an independently authenticated enrollment root.
///      The verifier MUST be an audited Groth16 verifier for the exact V1 circuit.
///      This contract does not authenticate root provenance or enable V4 setters.
interface IEchoBootstrapGroth16VerifierV1 {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[6] calldata input
    ) external view returns (bool);
}

contract EchoBootstrapProofGateV1 {
    address public immutable account;
    address public immutable registry;
    address public immutable verifier;
    uint256 public immutable trustedRoot;
    uint256 public immutable deploymentChainId;

    error InvalidConfiguration();
    error WrongChain();
    error WrongStatement();
    error ProofRejected();

    constructor(address account_, address registry_, address verifier_, uint256 trustedRoot_) {
        if (
            account_ == address(0) ||
            registry_.code.length == 0 ||
            verifier_.code.length == 0 ||
            trustedRoot_ == 0
        ) revert InvalidConfiguration();
        account = account_;
        registry = registry_;
        verifier = verifier_;
        trustedRoot = trustedRoot_;
        deploymentChainId = block.chainid;
    }

    /// @notice Verifies the V1 public statement against immutable domain bindings.
    /// @dev actionHash is a field element commitment supplied by the caller.
    ///      A future account integration MUST independently compute actionHash
    ///      from canonical operation data, registry, nonce and deadline.
    ///      This read-only method alone cannot authorize any action.
    function verifyBootstrapProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[6] calldata input
    ) external view returns (bool) {
        if (block.chainid != deploymentChainId) revert WrongChain();
        if (
            input[0] != trustedRoot ||
            input[1] != uint256(uint160(account)) ||
            input[2] != deploymentChainId
        ) revert WrongStatement();
        bool ok = IEchoBootstrapGroth16VerifierV1(verifier).verifyProof(a, b, c, input);
        if (!ok) revert ProofRejected();
        return true;
    }
}
