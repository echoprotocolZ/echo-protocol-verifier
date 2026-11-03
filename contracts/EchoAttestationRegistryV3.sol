// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title EchoAttestationRegistryV3
/// @notice Foundation for authenticated checkpoint attestations.
/// @dev Signature verification and authorization are not yet implemented.
contract EchoAttestationRegistryV3 is EIP712 {

    constructor() EIP712("EchoAttestationRegistryV3", "1") {}

    struct SignedCheckpoint {
        address account;
        address delegatee;
        bytes32 zoneHash;
        bytes32 checkpointCommitment;
        bytes32 authorizationCommitment;
        uint64 timestamp;
        uint256 nonce;
    }

    bytes32 public constant CHECKPOINT_TYPEHASH = keccak256(
        "SignedCheckpoint(address account,address delegatee,bytes32 zoneHash,bytes32 checkpointCommitment,bytes32 authorizationCommitment,uint64 timestamp,uint256 nonce)"
    );


    enum SignerType {
        Validator,
        Hardware
    }

    error UntrustedCheckpointSigner();

    function verifyCheckpointSigner(
        SignedCheckpoint calldata checkpoint,
        bytes calldata signature,
        SignerType signerType
    ) external view returns (address signer) {
        signer = ECDSA.recover(
            checkpointDigest(checkpoint),
            signature
        );

        bool trusted;

        if (signerType == SignerType.Validator) {
            trusted = trustedValidatorSigners[checkpoint.account][signer];
        } else {
            trusted = trustedHardwareSigners[checkpoint.account][signer];
        }

        if (!trusted) {
            revert UntrustedCheckpointSigner();
        }
    }


    error AttestationPolicyDisabled();
    error CheckpointZoneMismatch();
    error CheckpointTimestampInvalid();

    function validateCheckpointPolicy(
        SignedCheckpoint calldata checkpoint
    ) public view returns (AttestationTier requiredTier) {
        AttestationPolicy memory policy =
            attestationPolicies[checkpoint.account][checkpoint.delegatee];

        if (!policy.enabled) {
            revert AttestationPolicyDisabled();
        }

        if (checkpoint.zoneHash != policy.allowedZoneHash) {
            revert CheckpointZoneMismatch();
        }

        uint256 timestamp = uint256(checkpoint.timestamp);
        uint256 drift = uint256(policy.maxTimeDrift);

        if (
            timestamp > block.timestamp ||
            block.timestamp - timestamp > drift
        ) {
            revert CheckpointTimestampInvalid();
        }

        return policy.requiredTier;
    }


    // Records checkpoint digests that have already been consumed.
    mapping(bytes32 => bool) public consumedCheckpoints;

    // A nonce can be consumed only once per account and delegatee.
    mapping(address => mapping(address => mapping(uint256 => bool)))
        public consumedCheckpointNonces;


    event CheckpointConsumed(
        address indexed account,
        address indexed delegatee,
        bytes32 indexed digest
    );

    error CheckpointAlreadyConsumed();


    error UnauthorizedCheckpointConsumer();
    error UnsupportedAttestationTier();

    function consumeCheckpoint(
        SignedCheckpoint calldata checkpoint,
        bytes calldata signature
    ) external returns (bytes32 digest) {
        if (msg.sender != checkpoint.account) {
            revert UnauthorizedCheckpointConsumer();
        }

        AttestationTier tier = validateCheckpointPolicy(checkpoint);

        // Other tiers remain disabled until fully implemented.
        if (tier != AttestationTier.ValidatorOnly) {
            revert UnsupportedAttestationTier();
        }

        digest = checkpointDigest(checkpoint);

        if (consumedCheckpoints[digest]) {
            revert CheckpointAlreadyConsumed();
        }

        if (
            consumedCheckpointNonces[checkpoint.account]
                [checkpoint.delegatee][checkpoint.nonce]
        ) {
            revert CheckpointAlreadyConsumed();
        }

        address signer = ECDSA.recover(digest, signature);

        if (!trustedValidatorSigners[checkpoint.account][signer]) {
            revert UntrustedCheckpointSigner();
        }

        consumedCheckpoints[digest] = true;
        consumedCheckpointNonces[checkpoint.account]
            [checkpoint.delegatee][checkpoint.nonce] = true;

        emit CheckpointConsumed(
            checkpoint.account,
            checkpoint.delegatee,
            digest
        );
    }

    function checkpointDigest(
        SignedCheckpoint calldata checkpoint
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                CHECKPOINT_TYPEHASH,
                checkpoint.account,
                checkpoint.delegatee,
                checkpoint.zoneHash,
                checkpoint.checkpointCommitment,
                checkpoint.authorizationCommitment,
                checkpoint.timestamp,
                checkpoint.nonce
            )
        );

        return _hashTypedDataV4(structHash);
    }


    enum AttestationTier {
        ValidatorOnly,
        HybridPreferred,
        HardwareStrict
    }

    struct AttestationPolicy {
        bytes32 allowedZoneHash;
        uint64 maxTimeDrift;
        AttestationTier requiredTier;
        bool allowValidatorFallback;
        bool enabled;
    }

    mapping(address => mapping(address => AttestationPolicy))
        public attestationPolicies;

    // Trusted signer registrations are scoped to each account.
    mapping(address => mapping(address => bool))
        public trustedValidatorSigners;

    mapping(address => mapping(address => bool))
        public trustedHardwareSigners;

    event ValidatorSignerUpdated(
        address indexed account,
        address indexed signer,
        bool trusted
    );

    event HardwareSignerUpdated(
        address indexed account,
        address indexed signer,
        bool trusted
    );

    error InvalidSigner();

    /// @notice Register or revoke a validator signer for the caller.
    function setValidatorSigner(
        address signer,
        bool trusted
    ) external {
        if (signer == address(0)) revert InvalidSigner();

        trustedValidatorSigners[msg.sender][signer] = trusted;

        emit ValidatorSignerUpdated(msg.sender, signer, trusted);
    }

    /// @notice Register or revoke a hardware signer for the caller.
    function setHardwareSigner(
        address signer,
        bool trusted
    ) external {
        if (signer == address(0)) revert InvalidSigner();

        trustedHardwareSigners[msg.sender][signer] = trusted;

        emit HardwareSignerUpdated(msg.sender, signer, trusted);
    }

    event AttestationPolicyUpdated(
        address indexed account,
        address indexed delegatee,
        AttestationTier requiredTier
    );

    error InvalidDelegatee();
    error InvalidAttestationPolicy();

    /// @notice Configure an attestation policy for the calling account.
    function setAttestationPolicy(
        address delegatee,
        AttestationPolicy calldata policy
    ) external {
        if (delegatee == address(0)) revert InvalidDelegatee();

        if (policy.enabled) {
            if (
                policy.allowedZoneHash == bytes32(0) ||
                policy.maxTimeDrift == 0
            ) revert InvalidAttestationPolicy();

            // HardwareStrict must never allow validator-only fallback.
            if (
                policy.requiredTier == AttestationTier.HardwareStrict &&
                policy.allowValidatorFallback
            ) revert InvalidAttestationPolicy();
        }

        attestationPolicies[msg.sender][delegatee] = policy;

        emit AttestationPolicyUpdated(
            msg.sender,
            delegatee,
            policy.requiredTier
        );
    }
}
