// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;


contract MockVerifierV2 {
    bool public proofValid = true;

    function setProofValid(bool valid) external {
        proofValid = valid;
    }

    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[17] calldata
    ) external view returns (bool) {
        return proofValid;
    }
}

contract MockVerifier {
    bool public proofValid = true;

    function setProofValid(bool valid) external {
        proofValid = valid;
    }

    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[20] calldata
    ) external view returns (bool) {
        return proofValid;
    }
}

contract MockRegistry {
    mapping(address => bool) public registered;
    mapping(address => bool) public eligible;

    function setValidator(
        address node,
        bool isRegistered,
        bool isEligible
    ) external {
        registered[node] = isRegistered;
        eligible[node] = isEligible;
    }

    function isRegistered(address node) external view returns (bool) {
        return registered[node];
    }

    function isEligible(address node) external view returns (bool) {
        return eligible[node];
    }
}

contract TestTarget {
    uint256 public storedValue;

    function setValue(uint256 newValue) external {
        storedValue = newValue;
    }

    function fail() external pure {
        revert("Target deliberately failed");
    }
}
