// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoSmartAccountV4.sol";

contract EchoAccountFactory {
    event AccountCreated(
        address indexed account,
        address indexed owner,
        bytes32 indexed salt
    );

    error InvalidOwner();
    error InvalidBridge();

    function createAccount(
        address owner,
        address entryPoint,
        address bridge,
        bytes32 salt
    ) external returns (address account) {
        if (owner == address(0)) revert InvalidOwner();
        if (bridge.code.length == 0) revert InvalidBridge();

        account = address(
            new EchoSmartAccountV4{salt: salt}(
                owner,
                entryPoint,
                bridge
            )
        );

        emit AccountCreated(account, owner, salt);
    }

    function predictAccountAddress(
        address owner,
        address entryPoint,
        address bridge,
        bytes32 salt
    ) external view returns (address predicted) {
        bytes memory bytecode = abi.encodePacked(
            type(EchoSmartAccountV4).creationCode,
            abi.encode(owner, entryPoint, bridge)
        );

        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(bytecode)
            )
        );

        predicted = address(uint160(uint256(hash)));
    }
}
