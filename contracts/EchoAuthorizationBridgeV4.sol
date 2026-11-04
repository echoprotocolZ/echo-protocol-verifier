// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title EchoAuthorizationBridgeV4
/// @notice Development foundation for dual-proof transaction authorization.
/// @dev The Original Echo Protocol Z.
///      No transaction authorization is implemented yet.

/// @notice Read-only dual-proof verification interface.
/// @dev Proof verification alone does not authorize execution.
interface IEchoDualProofVerifierForBridgeV4 {
    struct SignedCheckpoint {
        address account;
        address delegatee;
        bytes32 zoneHash;
        bytes32 checkpointCommitment;
        bytes32 authorizationCommitment;
        uint64 timestamp;
        uint256 nonce;
    }

    function verifyDualProof(
        SignedCheckpoint calldata checkpoint,
        uint[2] calldata v3A,
        uint[2][2] calldata v3B,
        uint[2] calldata v3C,
        uint[20] calldata v3Signals,
        uint[2] calldata v4A,
        uint[2][2] calldata v4B,
        uint[2] calldata v4C,
        uint[5] calldata v4Signals
    ) external view returns (bool);
}


/// @notice Interface to the existing V3 checkpoint registry.
/// @dev Registry enforces trusted signers, policy, and checkpoint replay rules.
interface IEchoCheckpointRegistryForBridgeV4 {
    struct SignedCheckpoint {
        address account;
        address delegatee;
        bytes32 zoneHash;
        bytes32 checkpointCommitment;
        bytes32 authorizationCommitment;
        uint64 timestamp;
        uint256 nonce;
    }

    function checkpointDigest(
        SignedCheckpoint calldata checkpoint
    ) external view returns (bytes32);

    function consumeCheckpointFromBridge(
        SignedCheckpoint calldata checkpoint,
        bytes calldata signature
    ) external returns (bytes32);
}

contract EchoAuthorizationBridgeV4 {
    address public immutable dualProofVerifier;
    address public immutable checkpointRegistry;

    error InvalidDependency();

    event AuthorizationConsumed(
        address indexed account,
        uint256 indexed nullifier,
        address indexed target,
        uint256 nonce
    );

    /// @notice Authorizes a transaction using both V3 and V4 proofs.
    /// @dev Does not execute the transaction.
    ///      All checks and consumption occur atomically.
    function authorize(
        SignedCheckpoint calldata checkpoint,
        bytes calldata signature,
        uint[2] calldata v3A,
        uint[2][2] calldata v3B,
        uint[2] calldata v3C,
        uint[20] calldata v3Signals,
        uint[2] calldata v4A,
        uint[2][2] calldata v4B,
        uint[2] calldata v4C,
        uint[5] calldata v4Signals,
        address target,
        uint256 value,
        bytes calldata callData,
        uint256 expectedNonce
    ) external returns (bool) {
        _validateAccountAuthorization(checkpoint);

        _validateCheckpointBinding(checkpoint, v3Signals);

        _validateTransactionBinding(
            v3Signals,
            target,
            value,
            callData,
            expectedNonce
        );

        _validateValidatorSignature(
            checkpoint,
            signature,
            v3Signals
        );

        _validateDualProof(
            checkpoint,
            v3A,
            v3B,
            v3C,
            v3Signals,
            v4A,
            v4B,
            v4C,
            v4Signals
        );

        _consumeAuthenticatedCheckpoint(
            checkpoint,
            signature
        );

        _consumeNullifier(
            checkpoint.account,
            v3Signals[2]
        );

        emit AuthorizationConsumed(
            checkpoint.account,
            v3Signals[2],
            target,
            expectedNonce
        );

        return true;
    }


    error InvalidDualProof();

    /// @dev Requires both V3 and V4 proofs to pass verification.
    ///      Internal-only until the complete authorization path exists.
    function _validateDualProof(
        SignedCheckpoint calldata checkpoint,
        uint[2] calldata v3A,
        uint[2][2] calldata v3B,
        uint[2] calldata v3C,
        uint[20] calldata v3Signals,
        uint[2] calldata v4A,
        uint[2][2] calldata v4B,
        uint[2] calldata v4C,
        uint[5] calldata v4Signals
    ) internal view {
        bool verified =
            IEchoDualProofVerifierForBridgeV4(dualProofVerifier)
                .verifyDualProof(
                    IEchoDualProofVerifierForBridgeV4.SignedCheckpoint({
                        account: checkpoint.account,
                        delegatee: checkpoint.delegatee,
                        zoneHash: checkpoint.zoneHash,
                        checkpointCommitment: checkpoint.checkpointCommitment,
                        authorizationCommitment: checkpoint.authorizationCommitment,
                        timestamp: checkpoint.timestamp,
                        nonce: checkpoint.nonce
                    }),
                    v3A,
                    v3B,
                    v3C,
                    v3Signals,
                    v4A,
                    v4B,
                    v4C,
                    v4Signals
                );

        if (!verified) revert InvalidDualProof();
    }


    /// @dev Consumes a checkpoint using the existing V3 registry.
    ///      The caller must first validate both ZK proofs, checkpoint
    ///      bindings, transaction bindings, and validator signature.
    ///      Internal-only until the complete authorization path exists.
    function _consumeAuthenticatedCheckpoint(
        SignedCheckpoint calldata checkpoint,
        bytes calldata signature
    ) internal returns (bytes32) {
        return IEchoCheckpointRegistryForBridgeV4(checkpointRegistry)
            .consumeCheckpointFromBridge(
                IEchoCheckpointRegistryForBridgeV4.SignedCheckpoint({
                    account: checkpoint.account,
                    delegatee: checkpoint.delegatee,
                    zoneHash: checkpoint.zoneHash,
                    checkpointCommitment: checkpoint.checkpointCommitment,
                    authorizationCommitment: checkpoint.authorizationCommitment,
                    timestamp: checkpoint.timestamp,
                    nonce: checkpoint.nonce
                }),
                signature
            );
    }


    error ValidatorMismatch();

    /// @dev Binds the recovered checkpoint signer to the V3 proof.
    ///      Trusted-validator status is enforced separately by the registry.
    function _validateValidatorSignature(
        SignedCheckpoint calldata checkpoint,
        bytes calldata signature,
        uint[20] calldata signals
    ) internal view {
        bytes32 digest =
            IEchoCheckpointRegistryForBridgeV4(checkpointRegistry)
                .checkpointDigest(
                    IEchoCheckpointRegistryForBridgeV4.SignedCheckpoint({
                        account: checkpoint.account,
                        delegatee: checkpoint.delegatee,
                        zoneHash: checkpoint.zoneHash,
                        checkpointCommitment: checkpoint.checkpointCommitment,
                        authorizationCommitment: checkpoint.authorizationCommitment,
                        timestamp: checkpoint.timestamp,
                        nonce: checkpoint.nonce
                    })
                );

        address recoveredValidator = ECDSA.recover(
            digest,
            signature
        );

        if (
            signals[5] != uint256(uint160(recoveredValidator))
        ) revert ValidatorMismatch();
    }


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

    error UnauthorizedAccount();

    /// @dev Requires the account itself to call the bridge.
    ///      Delegatee permissions are controlled by each account.
    function _validateAccountAuthorization(
        SignedCheckpoint calldata checkpoint
    ) internal view {
        if (msg.sender != checkpoint.account) {
            revert UnauthorizedAccount();
        }

        if (
            checkpoint.delegatee != checkpoint.account &&
            !authorizedDelegatees[checkpoint.account][checkpoint.delegatee]
        ) {
            revert UnauthorizedDelegatee();
        }
    }


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
