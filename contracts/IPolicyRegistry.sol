
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPolicyRegistry {
    struct TokenPolicy {
        uint256 maxSpendPerTx;
        uint256 dailySpendLimit;
        bool isAllowed;
    }

    struct TargetPolicy {
        bool isAllowed;
    }

    struct Policy {
        bool isAllowed;
        uint64 expiryTimestamp;
        uint256 maxNativeSpendPerTx;
        uint256 dailyNativeSpendLimit;
        address admin;
    }

    event PolicyUpdated(address indexed account, address indexed delegatee);
    event TokenPolicyUpdated(address indexed account, address indexed delegatee, address indexed token);
    event TargetPolicyUpdated(address indexed account, address indexed delegatee, address indexed target, bool isAllowed);
    event SelectorPolicyUpdated(address indexed account, address indexed delegatee, address indexed target, bytes4 selector, bool isAllowed);
    event PolicyRevoked(address indexed account, address indexed delegatee);

    function setPolicy(address delegatee, Policy calldata policy) external;

    function setTokenPolicy(
        address delegatee,
        address token,
        TokenPolicy calldata tokenPolicy
    ) external;

    function revokePolicy(address delegatee) external;

    function setTargetPolicy(
        address delegatee,
        address target,
        bool isAllowed
    ) external;

    function setSelectorPolicy(
        address delegatee,
        address target,
        bytes4 selector,
        bool isAllowed
    ) external;

    function isSelectorAllowed(
        address account,
        address delegatee,
        address target,
        bytes4 selector
    ) external view returns (bool);

    function validateExecution(
        address account,
        address delegatee,
        address target,
        uint256 value,
        bytes calldata data
    ) external returns (bool);
}

