// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./EchoSmartAccountZ.sol";

contract EchoAccountFactoryZ is EIP712 {
    bytes32 private constant DEPLOY_TYPEHASH = keccak256(
        "Deploy(address owner,address entryPoint,address bridge,bytes32 salt,bytes32 configHash,uint256 deadline)"
    );

    event AccountCreated(
        address indexed account,
        address indexed owner,
        bytes32 indexed salt,
        bytes32 configHash
    );

    error InvalidOwner();
    error InvalidBridge();
    error InvalidConfiguration();
    error AuthorizationExpired();
    error InvalidSignature();

    constructor() EIP712("EchoAccountFactoryZ", "1") {}

    function configurationHash(
        address[] calldata targets,
        bytes[] calldata calls
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(targets, calls));
    }

    function deploymentDigest(
        address owner,
        address entryPoint,
        address bridge,
        bytes32 salt,
        bytes32 configHash,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    DEPLOY_TYPEHASH,
                    owner,
                    entryPoint,
                    bridge,
                    salt,
                    configHash,
                    deadline
                )
            )
        );
    }

    function predictAccountAddress(
        address owner,
        address entryPoint,
        address bridge,
        bytes32 salt
    ) public view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(EchoSmartAccountZ).creationCode,
            abi.encode(
                owner,
                entryPoint,
                bridge,
                address(this)
            )
        );

        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(bytecode)
            )
        );

        return address(uint160(uint256(hash)));
    }

    function createAccount(
        address owner,
        address entryPoint,
        address bridge,
        bytes32 salt,
        address[] calldata targets,
        bytes[] calldata calls,
        uint256 deadline,
        bytes calldata signature
    ) external returns (address account) {
        if (owner == address(0)) revert InvalidOwner();
        if (bridge.code.length == 0) revert InvalidBridge();
        if (targets.length != 5 || calls.length != 5) {
            revert InvalidConfiguration();
        }
        if (block.timestamp > deadline) {
            revert AuthorizationExpired();
        }

        bytes32 configHash = configurationHash(targets, calls);

        bytes32 digest = deploymentDigest(
            owner,
            entryPoint,
            bridge,
            salt,
            configHash,
            deadline
        );

        if (ECDSA.recover(digest, signature) != owner) {
            revert InvalidSignature();
        }

        account = address(
            new EchoSmartAccountZ{salt: salt}(
                owner,
                entryPoint,
                bridge,
                address(this)
            )
        );

        EchoSmartAccountZ(payable(account)).initialize(
            targets,
            calls
        );

        emit AccountCreated(
            account,
            owner,
            salt,
            configHash
        );
    }
}
