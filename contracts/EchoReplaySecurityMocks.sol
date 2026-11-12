// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only verifier. It does not verify Groth16 proofs.
contract EchoReplayVerifierMock {
    bool public result = true;
    function setResult(bool value) external { result = value; }
    fallback() external { assembly { mstore(0, sload(0)) return(0, 32) } }
}

/// @dev Test-only checkpoint registry that records consumption and can simulate failures.
contract EchoReplayRegistryMock {
    mapping(bytes32 => bool) public consumed;
    bool public failConsumption;
    function setFailConsumption(bool value) external { failConsumption = value; }
    function checkpointDigest(bytes calldata) external pure returns (bytes32) {
        return keccak256("echo-replay-test-checkpoint");
    }
    fallback(bytes calldata input) external returns (bytes memory) {
        if (msg.sig == bytes4(keccak256("consumeCheckpointFromBridge((address,address,bytes32,bytes32,bytes32,uint64,uint256),bytes)"))) {
            require(!failConsumption, "forced checkpoint failure");
            bytes32 key = keccak256(input);
            require(!consumed[key], "checkpoint already consumed");
            consumed[key] = true;
            return abi.encode(key);
        }
        revert("unknown registry call");
    }
}
