// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EchoAuthorizationBridgeV4
/// @notice Development foundation for dual-proof transaction authorization.
/// @dev The Original Echo Protocol Z.
///      No transaction authorization is implemented yet.
contract EchoAuthorizationBridgeV4 {
    address public immutable dualProofVerifier;
    address public immutable checkpointRegistry;

    error InvalidDependency();

    struct SignedCheckpoint {
        address account;
        address delegatee;
        bytes32 zoneHash;
        bytes32 checkpointCommitment;
        bytes32 authorizationCommitment;
        uint64 timestamp;
        uint256 nonce;
    }

    error CheckpointBindingMismatch();

    /// @dev Checks that V3 public signals match checkpoint fields.
    ///      This does not authenticate the checkpoint signature.
    function _validateCheckpointBinding(
        SignedCheckpoint calldata checkpoint,
        uint[20] calldata signals
    ) internal pure {
        if (
            uint256(checkpoint.checkpointCommitment) != signals[18] ||
            uint256(checkpoint.authorizationCommitment) != signals[1] ||
            uint256(uint160(checkpoint.account)) != signals[3] ||
            uint256(uint160(checkpoint.delegatee)) != signals[4] ||
            checkpoint.nonce != signals[11] ||
            checkpoint.timestamp < signals[16] ||
            checkpoint.timestamp > signals[17] ||
            uint256(checkpoint.timestamp) != signals[19]
        ) revert CheckpointBindingMismatch();
    }


    error InvalidChain();
    error ExpiredAuthorization();
    error InvalidTransaction();
    error InvalidNonce();

    /// @dev Validates transaction-specific V3 public signals.
    ///      Internal-only until full V4 authorization is implemented.
    function _validateTransactionBinding(
        uint[20] calldata signals,
        address target,
        uint256 value,
        bytes calldata callData,
        uint256 expectedNonce
    ) internal view {
        if (signals[10] != block.chainid) revert InvalidChain();
        if (block.timestamp > signals[12]) {
            revert ExpiredAuthorization();
        }

        if (
            signals[6] != uint256(uint160(target)) ||
            signals[7] != value
        ) revert InvalidTransaction();

        if (signals[11] != expectedNonce) revert InvalidNonce();

        uint256 dataHash = uint256(keccak256(callData));

        if (
            signals[8] != uint256(uint128(dataHash)) ||
            signals[9] != (dataHash >> 128)
        ) revert InvalidTransaction();
    }


    mapping(uint256 => bool) public consumedNullifiers;

    error NullifierAlreadyUsed();

    event NullifierConsumed(
        address indexed account,
        uint256 indexed nullifier
    );

    /// @dev Internal-only until the full authorization path is implemented.
    function _consumeNullifier(
        address account,
        uint256 nullifier
    ) internal {
        if (
            nullifier == 0 ||
            consumedNullifiers[nullifier]
        ) revert NullifierAlreadyUsed();

        consumedNullifiers[nullifier] = true;

        emit NullifierConsumed(account, nullifier);
    }


    mapping(address => mapping(address => bool))
        public authorizedDelegatees;

    event DelegateeUpdated(
        address indexed account,
        address indexed delegatee,
        bool authorized
    );

    error InvalidDelegatee();
    error UnauthorizedDelegatee();

    /// @notice Each account manages its own delegatee permissions.
    function setAuthorizedDelegatee(
        address delegatee,
        bool authorized
    ) external {
        if (delegatee == address(0)) revert InvalidDelegatee();

        authorizedDelegatees[msg.sender][delegatee] = authorized;

        emit DelegateeUpdated(msg.sender, delegatee, authorized);
    }


    constructor(
        address dualProofVerifier_,
        address checkpointRegistry_
    ) {
        if (
            dualProofVerifier_ == address(0) ||
            checkpointRegistry_ == address(0) ||
            dualProofVerifier_.code.length == 0 ||
            checkpointRegistry_.code.length == 0
        ) revert InvalidDependency();

        dualProofVerifier = dualProofVerifier_;
        checkpointRegistry = checkpointRegistry_;
    }
}
