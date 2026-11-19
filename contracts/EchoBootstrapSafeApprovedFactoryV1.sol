// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoBootstrapProofGateV1.sol";
import "./EchoBootstrapBridgeExecutorV1.sol";

interface IEchoBootstrapSafe1271 {
    function isValidSignature(bytes32 hash, bytes calldata signatures) external view returns (bytes4);
}

/// @notice Experimental one-shot bootstrap pair factory gated by Safe EIP-1271 approval.
/// @dev The Safe itself must have independently verified 2-of-2 ownership/threshold.
///      Never infer the threshold from this contract. A deployer choosing a malicious
///      "Safe" is not protected: independently pin and verify safe address/code.
contract EchoBootstrapSafeApprovedFactoryV1 {
    bytes4 private constant MAGIC = 0x1626ba7e;
    bytes32 public constant APPROVAL_DOMAIN =
        keccak256("ECHO_BOOTSTRAP_SAFE_APPROVAL_V1");
    uint256 private constant FIELD_MODULUS =
        21888242871839275222246405745257275088696311157297823662689037894645226208583;

    address public immutable approvedSafe;
    bool public deployed;
    error InvalidSafe();
    error InvalidConfiguration();
    error ApprovalRejected();
    error AlreadyDeployed();
    error AddressMismatch();

    event ApprovedPairDeployed(bytes32 indexed approvalDigest, address indexed gate, address indexed executor);

    constructor(address safe_) {
        if (safe_.code.length == 0) revert InvalidSafe();
        approvedSafe = safe_;
    }

    function predictGate() public view returns (address) {
        return address(uint160(uint256(keccak256(
            abi.encodePacked(hex"d694", address(this), hex"01")
        ))));
    }

    function predictExecutor(address registry, bytes32 salt) public view returns (address) {
        bytes32 initHash = keccak256(abi.encodePacked(
            type(EchoBootstrapBridgeExecutorV1).creationCode,
            abi.encode(predictGate(), registry)
        ));
        return address(uint160(uint256(keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, initHash)
        ))));
    }

    /// @notice Exact configuration digest the Safe must approve.
    /// @dev Includes factory, Safe, chain, root, verifier, registry, salt and both addresses.
    function approvalDigest(address registry, address verifier, uint256 root, bytes32 salt)
        public view returns (bytes32)
    {
        return keccak256(abi.encode(
            APPROVAL_DOMAIN, block.chainid, address(this), approvedSafe,
            registry, verifier, root, salt, predictGate(), predictExecutor(registry, salt)
        ));
    }

    function deployApprovedPair(
        address registry, address verifier, uint256 root, bytes32 salt,
        bytes calldata safeSignatures
    ) external returns (address gateAddress, address executorAddress) {
        if (deployed) revert AlreadyDeployed();
        if (registry.code.length == 0 || verifier.code.length == 0 ||
            root == 0 || root >= FIELD_MODULUS) revert InvalidConfiguration();

        bytes32 digest = approvalDigest(registry, verifier, root, salt);
        // A Safe must validate its own threshold and signatures.
        try IEchoBootstrapSafe1271(approvedSafe).isValidSignature(digest, safeSignatures)
            returns (bytes4 result)
        {
            if (result != MAGIC) revert ApprovalRejected();
        } catch {
            revert ApprovalRejected();
        }

        deployed = true;
        address expectedGate = predictGate();
        address expectedExecutor = predictExecutor(registry, salt);
        EchoBootstrapProofGateV1 gate = new EchoBootstrapProofGateV1(
            expectedExecutor, registry, verifier, root
        );
        gateAddress = address(gate);
        if (gateAddress != expectedGate) revert AddressMismatch();
        EchoBootstrapBridgeExecutorV1 executor =
            new EchoBootstrapBridgeExecutorV1{salt: salt}(gateAddress, registry);
        executorAddress = address(executor);
        if (executorAddress != expectedExecutor) revert AddressMismatch();
        emit ApprovedPairDeployed(digest, gateAddress, executorAddress);
    }
}
