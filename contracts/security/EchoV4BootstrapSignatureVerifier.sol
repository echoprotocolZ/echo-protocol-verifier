// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @notice EXPERIMENTAL independent signature trust anchor for V4 bootstrap.
/// @dev This verifies ECDSA signatures, NOT Groth16/ZK proofs. Never describe
///      successful signature checks as zero-knowledge verification.
///      The account must hash the canonical registration intent (including
///      account, registry, bridge, chain, nonce, deadline and operation).
///      The signature is bound to this verifier and its chain to prevent
///      cross-verifier and cross-chain replay.
contract EchoV4BootstrapSignatureVerifier {
    address public immutable trustedSigner;
    error InvalidSigner();

    constructor(address signer_) {
        if (signer_ == address(0)) revert InvalidSigner();
        trustedSigner = signer_;
    }

    function registrationDigest(bytes32 intentHash) public view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("ECHO_V4_BOOTSTRAP_SIGNATURE_VERIFIER_V1"),
            block.chainid,
            address(this),
            intentHash
        ));
    }

    /// @notice Proof bytes here are an ECDSA signature, not a ZK proof.
    function verifyRegistration(bytes32 intentHash, bytes calldata signature)
        external view returns (bool)
    {
        (address recovered, ECDSA.RecoverError error,) = ECDSA.tryRecover(
            MessageHashUtils.toEthSignedMessageHash(registrationDigest(intentHash)),
            signature
        );
        return error == ECDSA.RecoverError.NoError && recovered == trustedSigner;
    }
}
