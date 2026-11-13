// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoSmartAccountV4Bootstrapped.sol";

interface IEchoDelegateePermissionBridge {
    function setAuthorizedDelegatee(address delegatee, bool authorized) external;
}

/// @notice Experimental V4 account with proof-bound delegatee administration.
/// @dev New deployment required; DOES NOT modify or upgrade existing Amoy account.
///      The administrative checkpoint MUST be self-delegated, breaking the
///      otherwise circular dependency on pre-existing delegatee authorization.
contract EchoSmartAccountV4DelegationCandidate is EchoSmartAccountV4Bootstrapped {
    error InvalidDelegationIntent();
    error DelegationReentrancy();

    bytes32 public constant DELEGATION_DOMAIN =
        keccak256("ECHO_PROTOCOL_Z_V4_DELEGATEE_ADMIN_V1");
    uint256 private delegationLock;

    event ProofAuthorizedDelegatee(address indexed delegatee, bool authorized, uint256 nonce);

    struct ProofBundle {
        uint[2] v3A;
        uint[2][2] v3B;
        uint[2] v3C;
        uint[20] v3Signals;
        uint[2] v4A;
        uint[2][2] v4B;
        uint[2] v4C;
        uint[5] v4Signals;
    }

    constructor(
        address owner_,
        address entryPoint_,
        address bridge_,
        address validator_,
        EchoGeographicZoneV4.Zone memory initialZone_,
        uint64 maxTimeDrift_
    ) EchoSmartAccountV4Bootstrapped(
        owner_, entryPoint_, bridge_, validator_, initialZone_, maxTimeDrift_
    ) {}

    /// @notice Canonical calldata for a proof-authorized permission update.
    /// @dev Binds domain, chain, account, delegatee, permission and nonce.
    function delegationIntent(
        address delegatee,
        bool authorized
    ) public view returns (bytes memory) {
        return abi.encode(
            DELEGATION_DOMAIN,
            block.chainid,
            address(this),
            delegatee,
            authorized,
            nonce
        );
    }

    /// @notice Approve/revoke a delegatee only with self-delegated dual proof.
    /// @dev Bridge binds proof public signals to target=this, value=0,
    ///      calldata=delegationIntent(...) and current nonce.
    function authorizeDelegateeWithProof(
        IEchoAuthorizationBridgeForAccountV4.SignedCheckpoint calldata checkpoint,
        bytes calldata signature,
        ProofBundle calldata proof,
        address delegatee,
        bool authorized
    ) external returns (bool) {
        if (delegationLock != 0) revert DelegationReentrancy();
        delegationLock = 1;

        if (
            msg.sender != owner ||
            checkpoint.account != address(this) ||
            checkpoint.delegatee != address(this) ||
            delegatee == address(0) ||
            delegatee == address(this)
        ) revert InvalidDelegationIntent();

        uint256 currentNonce = nonce;
        bytes memory intent = delegationIntent(delegatee, authorized);

        bool valid = authorizationBridge.authorize(
            checkpoint,
            signature,
            proof.v3A, proof.v3B, proof.v3C, proof.v3Signals,
            proof.v4A, proof.v4B, proof.v4C, proof.v4Signals,
            address(this), 0, intent, currentNonce
        );
        if (!valid) revert AuthorizationFailed();

        nonce = currentNonce + 1;
        IEchoDelegateePermissionBridge(address(authorizationBridge))
            .setAuthorizedDelegatee(delegatee, authorized);

        emit ProofAuthorizedDelegatee(delegatee, authorized, currentNonce);
        delegationLock = 0;
        return true;
    }
}
