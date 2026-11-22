// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev LOCAL TEST FIXTURE ONLY. This is not a real proof verifier.
contract EchoAtomicRollbackBridgeMock {
    uint256 public consumed;
    function checkpointRegistry() external view returns (address) { return address(this); }
    function dualProofVerifier() external view returns (address) { return address(this); }
    function v4Gateway() external view returns (address) { return address(this); }
    function policyRegistry() external view returns (address) { return address(this); }

    struct SignedCheckpoint {
        address account; address delegatee; bytes32 zoneHash;
        bytes32 checkpointCommitment; bytes32 authorizationCommitment;
        uint64 timestamp; uint256 nonce;
    }
    function authorize(
        SignedCheckpoint calldata checkpoint, bytes calldata,
        uint[2] calldata, uint[2][2] calldata, uint[2] calldata,
        uint[20] calldata, uint[2] calldata, uint[2][2] calldata,
        uint[2] calldata, uint[5] calldata, address, uint256,
        bytes calldata, uint256
    ) external returns (bool) {
        require(msg.sender == checkpoint.account, "account only");
        consumed += 1;
        return true;
    }
}
contract EchoAtomicRollbackTargetMock {
    uint256 public calls;
    function succeed() external { calls += 1; }
    function failAfterWrite() external {
        calls += 1;
        revert("forced downstream failure");
    }
}
