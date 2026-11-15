// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// TEST ONLY. Mock authorization is NOT cryptographic proof verification.
contract EchoLocalExecutionBridgeMock {
    struct SignedCheckpoint {
        address account; address delegatee; bytes32 zoneHash;
        bytes32 checkpointCommitment; bytes32 authorizationCommitment;
        uint64 timestamp; uint256 nonce;
    }
    address public checkpointRegistry;
    address public dualProofVerifier;
    bool public approve;
    uint256 public calls;
    uint256 public lastNonce;
    error Rejected();
    constructor(address registry_, address dual_) {
        checkpointRegistry = registry_;
        dualProofVerifier = dual_;
    }
    function setApprove(bool value) external { approve = value; }
    function authorize(
        SignedCheckpoint calldata, bytes calldata,
        uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[20] calldata,
        uint[2] calldata, uint[2][2] calldata, uint[2] calldata, uint[5] calldata,
        address, uint256, bytes calldata, uint256 expectedNonce
    ) external returns (bool) {
        if (!approve) revert Rejected();
        lastNonce = expectedNonce;
        calls++;
        return true;
    }
}
contract EchoLocalGatewayMock {
    address public policyRegistry;
    constructor(address policy_) {policyRegistry=policy_;}
}
contract EchoLocalDualMock {
    address public v4Gateway;
    constructor(address gateway_) {v4Gateway=gateway_;}
}
contract EchoLocalTargetMock {
    uint256 public count;
    error TargetReverted();
    function increment() external {count++;}
    function fail() external pure {revert TargetReverted();}
}
