// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IEchoGroth16VerifierV3 {
    function verifyProof(
        uint[2] calldata proofA,
        uint[2][2] calldata proofB,
        uint[2] calldata proofC,
        uint[19] calldata signals
    ) external view returns (bool);
}

/// @notice V3 bridge foundation. Authorization is not yet implemented.

interface IEchoCheckpointRegistryV3 {
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

contract EchoAuthorizationBridgeV3 {
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
    mapping(uint256 => bool) public consumedNullifiers;

    error ValidatorMismatch();
    mapping(address => mapping(address => bool))
        public authorizedDelegatees;

    event DelegateeUpdated(
        address indexed account,
        address indexed delegatee,
        bool authorized
    );

    error InvalidDelegatee();
    error UnauthorizedDelegatee();

    function setAuthorizedDelegatee(
        address delegatee,
        bool authorized
    ) external {
        if (delegatee == address(0)) revert InvalidDelegatee();

        authorizedDelegatees[msg.sender][delegatee] = authorized;

        emit DelegateeUpdated(msg.sender, delegatee, authorized);
    }


    error NotAccountCaller();
    error InvalidChain();
    error ExpiredAuthorization();
    error InvalidTransaction();
    error InvalidNonce();
    error NullifierAlreadyUsed();

    event AuthorizationConsumed(
        address indexed account,
        uint256 indexed nullifier,
        address indexed target,
        uint256 nonce
    );

    function authorize(
        SignedCheckpoint calldata checkpoint,
        bytes calldata signature,
        uint[2] calldata proofA,
        uint[2][2] calldata proofB,
        uint[2] calldata proofC,
        uint[19] calldata signals,
        address target,
        uint256 value,
        bytes calldata callData,
        uint256 expectedNonce
    ) external returns (bool) {
        if (msg.sender != checkpoint.account) revert NotAccountCaller();

        if (
            checkpoint.delegatee != checkpoint.account &&
            !authorizedDelegatees[checkpoint.account][checkpoint.delegatee]
        ) revert UnauthorizedDelegatee();


        if (signals[11] != block.chainid) revert InvalidChain();
        if (block.timestamp > signals[13]) revert ExpiredAuthorization();

        if (
            uint256(checkpoint.checkpointCommitment) != signals[1] ||
            uint256(checkpoint.authorizationCommitment) != signals[2] ||
            uint256(uint160(checkpoint.account)) != signals[4] ||
            uint256(uint160(checkpoint.delegatee)) != signals[5] ||
            checkpoint.nonce != signals[12] ||
            checkpoint.timestamp < signals[17] ||
            checkpoint.timestamp > signals[18]
        ) revert CheckpointBindingMismatch();

        if (
            signals[7] != uint256(uint160(target)) ||
            signals[8] != value
        ) revert InvalidTransaction();

        if (signals[12] != expectedNonce) revert InvalidNonce();

        uint256 dataHash = uint256(keccak256(callData));

        if (
            signals[9] != uint256(uint128(dataHash)) ||
            signals[10] != (dataHash >> 128)
        ) revert InvalidTransaction();

        uint256 nullifier = signals[3];

        if (
            nullifier == 0 ||
            consumedNullifiers[nullifier]
        ) revert NullifierAlreadyUsed();

        if (!verifier.verifyProof(proofA, proofB, proofC, signals)) {
            revert InvalidProof();
        }

        // The validator in the ZK proof must have signed this checkpoint.
        address recoveredValidator = ECDSA.recover(
            IEchoCheckpointRegistryV3(checkpointRegistry)
                .checkpointDigest(
                    IEchoCheckpointRegistryV3.SignedCheckpoint({
                        account: checkpoint.account,
                        delegatee: checkpoint.delegatee,
                        zoneHash: checkpoint.zoneHash,
                        checkpointCommitment: checkpoint.checkpointCommitment,
                        authorizationCommitment: checkpoint.authorizationCommitment,
                        timestamp: checkpoint.timestamp,
                        nonce: checkpoint.nonce
                    })
                ),
            signature
        );

        if (
            signals[6] != uint256(uint160(recoveredValidator))
        ) revert ValidatorMismatch();

        IEchoCheckpointRegistryV3(checkpointRegistry)
            .consumeCheckpointFromBridge(
                IEchoCheckpointRegistryV3.SignedCheckpoint({
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

        consumedNullifiers[nullifier] = true;

        emit AuthorizationConsumed(
            checkpoint.account,
            nullifier,
            target,
            expectedNonce
        );

        return true;
    }

    error InvalidProof();

    /// @notice Verifies a ZK proof against the supplied checkpoint.
    /// @dev Does not verify signatures, consume nonces, or authorize execution.
    function verifyCheckpointProof(
        SignedCheckpoint calldata checkpoint,
        uint[2] calldata proofA,
        uint[2][2] calldata proofB,
        uint[2] calldata proofC,
        uint[19] calldata signals
    ) external view returns (bool) {
        if (
            uint256(checkpoint.checkpointCommitment) != signals[1] ||
            uint256(checkpoint.authorizationCommitment) != signals[2] ||
            uint256(uint160(checkpoint.account)) != signals[4] ||
            uint256(uint160(checkpoint.delegatee)) != signals[5] ||
            checkpoint.nonce != signals[12] ||
            checkpoint.timestamp < signals[17] ||
            checkpoint.timestamp > signals[18]
        ) revert CheckpointBindingMismatch();

        if (!verifier.verifyProof(proofA, proofB, proofC, signals)) {
            revert InvalidProof();
        }

        return true;
    }


    /// @notice Checks that signed checkpoint fields match ZK public signals.
    /// @dev This does not verify the signature or Groth16 proof.
    function validateCheckpointBinding(
        SignedCheckpoint calldata checkpoint,
        uint[19] calldata signals
    ) external pure returns (bool) {
        if (
            uint256(checkpoint.checkpointCommitment) != signals[1] ||
            uint256(checkpoint.authorizationCommitment) != signals[2] ||
            uint256(uint160(checkpoint.account)) != signals[4] ||
            uint256(uint160(checkpoint.delegatee)) != signals[5] ||
            checkpoint.nonce != signals[12] ||
            checkpoint.timestamp < signals[17] ||
            checkpoint.timestamp > signals[18]
        ) revert CheckpointBindingMismatch();

        return true;
    }

    IEchoGroth16VerifierV3 public immutable verifier;
    address public immutable checkpointRegistry;

    error InvalidContract();

    constructor(address verifierAddress, address registryAddress) {
        if (
            verifierAddress == address(0) ||
            registryAddress == address(0) ||
            verifierAddress.code.length == 0 ||
            registryAddress.code.length == 0
        ) revert InvalidContract();

        verifier = IEchoGroth16VerifierV3(verifierAddress);
        checkpointRegistry = registryAddress;
    }
}
