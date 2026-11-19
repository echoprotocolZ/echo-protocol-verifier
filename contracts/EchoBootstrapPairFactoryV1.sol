// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoBootstrapProofGateV1.sol";
import "./EchoBootstrapBridgeExecutorV1.sol";

/// @notice Local prototype factory resolving the gate/executor address cycle.
/// @dev Deploys exactly one gate using CREATE nonce 1, then the executor with CREATE2.
///      Does not establish independent trusted-root provenance or production readiness.
contract EchoBootstrapPairFactoryV1 {
    bool public deployed;
    error AlreadyDeployed();
    error UnexpectedGateAddress();
    error UnexpectedExecutorAddress();

    event PairDeployed(address indexed gate, address indexed executor);

    function predictGate() public view returns (address) {
        // First CREATE from a freshly deployed contract uses creation nonce 1.
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

    function deployPair(
        address registry, address verifier, uint256 independentlyAuthenticatedRoot, bytes32 salt
    ) external returns (address gateAddress, address executorAddress) {
        if (deployed) revert AlreadyDeployed();
        // Mark before external construction; all state rolls back on failure.
        deployed = true;
        address expectedGate = predictGate();
        address expectedExecutor = predictExecutor(registry, salt);
        EchoBootstrapProofGateV1 gate = new EchoBootstrapProofGateV1(
            expectedExecutor, registry, verifier, independentlyAuthenticatedRoot
        );
        gateAddress = address(gate);
        if (gateAddress != expectedGate) revert UnexpectedGateAddress();
        EchoBootstrapBridgeExecutorV1 executor =
            new EchoBootstrapBridgeExecutorV1{salt: salt}(gateAddress, registry);
        executorAddress = address(executor);
        if (executorAddress != expectedExecutor) revert UnexpectedExecutorAddress();
        emit PairDeployed(gateAddress, executorAddress);
    }
}
