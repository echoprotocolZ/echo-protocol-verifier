// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only EIP-1271 stand-in. NOT a real Safe or multisig.
///      Signature approval is deliberately controlled by the test harness.
contract EchoBootstrap1271Stub {
    bytes4 internal constant MAGIC = 0x1626ba7e;
    bytes32 public approvedDigest;
    bool public enabled;
    function approve(bytes32 digest) external { approvedDigest = digest; enabled = true; }
    function revoke() external { enabled = false; }
    function isValidSignature(bytes32 digest, bytes calldata signatures) external view returns (bytes4) {
        if (enabled && digest == approvedDigest && keccak256(signatures) == keccak256(hex"1234"))
            return MAGIC;
        return 0xffffffff;
    }
}
