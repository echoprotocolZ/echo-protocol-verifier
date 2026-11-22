// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EchoV4BootstrapProofGate
/// @notice Fail-closed specification for independent V4 registration authorization.
/// @dev This contract is NOT a proof verifier and cannot authorize registration.
///      It deliberately has no external mutating entrypoint. A future implementation
///      must bind the exact domain-separated admin intent to authenticated public
///      proof inputs and must not depend on the bridge being registered.
abstract contract EchoV4BootstrapProofGate {
    error BootstrapProofNotImplemented();

    /// @dev A proof verifier implementation must bind every field of the
    ///      canonical intent (account, registry, bridge, authorization flag,
    ///      chain ID, nonce, deadline) to its verified public inputs.
    ///      Returning true without cryptographic verification is forbidden.
    function _verifyBootstrapProof(
        bytes32 canonicalIntentHash,
        bytes calldata proof
    ) internal view virtual returns (bool) {
        canonicalIntentHash;
        proof;
        revert BootstrapProofNotImplemented();
    }
}
