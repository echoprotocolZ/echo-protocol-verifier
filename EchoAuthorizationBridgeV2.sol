// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEchoGroth16VerifierV2 {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[17] calldata _pubSignals
    ) external view returns (bool);
}

interface IEchoRegistryV2 {
    function isRegistered(address node) external view returns (bool);
    function isEligible(address node) external view returns (bool);
}

contract EchoAuthorizationBridgeV2 {
    IEchoGroth16VerifierV2 public immutable verifier;
    IEchoRegistryV2 public immutable registry;

    mapping(uint256 => bool) public consumedNullifiers;

    event AuthorizationConsumed(
        address indexed account,
        address indexed validator,
        uint256 indexed nullifier,
        address target,
        uint256 value,
        uint256 nonce
    );

    error ZeroAddress();
    error NotAccountCaller();
    error InvalidChain();
    error ExpiredAuthorization();
    error InvalidAccount();
    error InvalidTransaction();
    error InvalidNonce();
    error InvalidValidator();
    error NullifierAlreadyUsed();
    error InvalidProof();

    constructor(address verifierAddress, address registryAddress) {
        if (
            verifierAddress == address(0) ||
            registryAddress == address(0) ||
            verifierAddress.code.length == 0 ||
            registryAddress.code.length == 0
        ) revert ZeroAddress();

        verifier = IEchoGroth16VerifierV2(verifierAddress);
        registry = IEchoRegistryV2(registryAddress);
    }

    function authorize(
        uint[2] calldata proofA,
        uint[2][2] calldata proofB,
        uint[2] calldata proofC,
        uint[17] calldata signals,
        address target,
        uint256 value,
        bytes calldata callData,
        uint256 expectedNonce
    ) external returns (bool) {
        address account = address(uint160(signals[3]));
        address validator = address(uint160(signals[4]));
        address signalTarget = address(uint160(signals[5]));

        if (msg.sender != account) revert NotAccountCaller();

        if (signals[9] != block.chainid) revert InvalidChain();

        if (block.timestamp > signals[11]) {
            revert ExpiredAuthorization();
        }

        if (signals[3] != uint256(uint160(msg.sender))) {
            revert InvalidAccount();
        }

        if (
            signalTarget != target ||
            signals[6] != value
        ) revert InvalidTransaction();

        if (signals[10] != expectedNonce) revert InvalidNonce();

        if (
            !registry.isRegistered(validator) ||
            !registry.isEligible(validator)
        ) revert InvalidValidator();

        uint256 dataHash = uint256(keccak256(callData));

        uint256 expectedLow = uint256(uint128(dataHash));
        uint256 expectedHigh = dataHash >> 128;

        if (
            signals[7] != expectedLow ||
            signals[8] != expectedHigh
        ) revert InvalidTransaction();

        uint256 nullifier = signals[2];

        if (
            nullifier == 0 ||
            consumedNullifiers[nullifier]
        ) revert NullifierAlreadyUsed();

        if (!verifier.verifyProof(proofA, proofB, proofC, signals)) {
            revert InvalidProof();
        }

        consumedNullifiers[nullifier] = true;

        emit AuthorizationConsumed(
            account,
            validator,
            nullifier,
            target,
            value,
            expectedNonce
        );

        return true;
    }
}

