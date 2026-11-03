// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IPolicyRegistry.sol";

contract PolicyRegistry is IPolicyRegistry {
    mapping(address => mapping(address => Policy)) public policies;

    mapping(address => mapping(address => mapping(address => TokenPolicy)))
        public tokenPolicies;

    mapping(address => mapping(address => mapping(address => TargetPolicy)))
        public targetPolicies;

    mapping(address => mapping(address => mapping(address => mapping(bytes4 => bool))))
        private selectorPolicies;

    mapping(address => mapping(address => mapping(address => mapping(bytes4 => bool))))
        private selectorConfigured;

    mapping(address => mapping(address => mapping(uint256 => uint256)))
        public dailyNativeSpent;

    mapping(address => mapping(address => mapping(address => mapping(uint256 => uint256))))
        public dailyTokenSpent;

    // A new generation invalidates permissions from prior delegations.
    mapping(address => mapping(address => uint256)) public policyGeneration;

    mapping(address => mapping(address => mapping(address => uint256)))
        private targetPermissionGeneration;

    mapping(address => mapping(address => mapping(address => mapping(bytes4 => uint256))))
        private selectorPermissionGeneration;

    error UnauthorizedAccount();
    error UnauthorizedDelegatee();
    error UnauthorizedAdmin();
    error PolicyExpired();
    error InvalidPolicy();
    error InvalidTarget();
    error InvalidSelector();
    error TargetNotAllowed();
    error SelectorNotAllowed();
    error TokenNotAllowed();
    error TxLimitExceeded();
    error DailyLimitExceeded();
    error InvalidTokenCall();

    modifier onlyAccount(address account) {
        if (msg.sender != account) revert UnauthorizedAccount();
        _;
    }

    modifier onlyPolicyAdmin(address account, address delegatee) {
        address admin = policies[account][delegatee].admin;

        if (msg.sender != account && msg.sender != admin) {
            revert UnauthorizedAdmin();
        }
        _;
    }


    // Tracks the delegation generation for each token approval.
    mapping(address => mapping(address => mapping(address => uint256)))
        public tokenPermissionGeneration;

    function setPolicy(
        address delegatee,
        Policy calldata policy
    ) external override {
        if (
            delegatee == address(0) ||
            policy.admin == address(0) ||
            policy.expiryTimestamp <= block.timestamp
        ) revert InvalidPolicy();

        // Invalidate permissions from any previous policy generation.
        policyGeneration[msg.sender][delegatee] += 1;

        policies[msg.sender][delegatee] = policy;

        emit PolicyUpdated(msg.sender, delegatee);
    }

    // Account-scoped token policy administration.
    function setTokenPolicyFor(
        address account,
        address delegatee,
        address token,
        TokenPolicy calldata tokenPolicy
    ) external {
        if (account == address(0) || token == address(0)) {
            revert InvalidTarget();
        }

        Policy storage policy = policies[account][delegatee];

        if (!policy.isAllowed || block.timestamp > policy.expiryTimestamp) {
            revert InvalidPolicy();
        }

        if (msg.sender != account && msg.sender != policy.admin) {
            revert UnauthorizedAdmin();
        }

        tokenPermissionGeneration[account][delegatee][token] =
            policyGeneration[account][delegatee];

        tokenPolicies[account][delegatee][token] = tokenPolicy;

        emit TokenPolicyUpdated(account, delegatee, token);
    }

    function setTokenPolicy(
        address delegatee,
        address token,
        TokenPolicy calldata tokenPolicy
    ) external override onlyPolicyAdmin(msg.sender, delegatee) {
        if (token == address(0)) revert InvalidTarget();

        tokenPermissionGeneration[msg.sender][delegatee][token] =
            policyGeneration[msg.sender][delegatee];

        tokenPolicies[msg.sender][delegatee][token] = tokenPolicy;

        emit TokenPolicyUpdated(msg.sender, delegatee, token);
    }

    // Account-scoped target administration.
    // Only the account or its designated policy admin may call.
    function setTargetPolicyFor(
        address account,
        address delegatee,
        address target,
        bool isAllowed
    ) external {
        if (account == address(0) || target == address(0)) {
            revert InvalidTarget();
        }

        Policy storage policy = policies[account][delegatee];

        if (!policy.isAllowed || block.timestamp > policy.expiryTimestamp) {
            revert InvalidPolicy();
        }

        if (msg.sender != account && msg.sender != policy.admin) {
            revert UnauthorizedAdmin();
        }

        targetPermissionGeneration[account][delegatee][target] =
            policyGeneration[account][delegatee];

        targetPolicies[account][delegatee][target] =
            TargetPolicy({isAllowed: isAllowed});

        emit TargetPolicyUpdated(
            account,
            delegatee,
            target,
            isAllowed
        );
    }

    function setTargetPolicy(
        address delegatee,
        address target,
        bool isAllowed
    ) external override onlyPolicyAdmin(msg.sender, delegatee) {
        if (target == address(0)) revert InvalidTarget();

        targetPermissionGeneration[msg.sender][delegatee][target] =
            policyGeneration[msg.sender][delegatee];

        targetPolicies[msg.sender][delegatee][target] =
            TargetPolicy({isAllowed: isAllowed});

        emit TargetPolicyUpdated(
            msg.sender,
            delegatee,
            target,
            isAllowed
        );
    }

    // Account-scoped selector administration.
    function setSelectorPolicyFor(
        address account,
        address delegatee,
        address target,
        bytes4 selector,
        bool isAllowed
    ) external {
        if (
            account == address(0) ||
            target == address(0) ||
            selector == bytes4(0)
        ) {
            revert InvalidSelector();
        }

        Policy storage policy = policies[account][delegatee];

        if (!policy.isAllowed || block.timestamp > policy.expiryTimestamp) {
            revert InvalidPolicy();
        }

        if (msg.sender != account && msg.sender != policy.admin) {
            revert UnauthorizedAdmin();
        }

        selectorPermissionGeneration[account][delegatee][target][selector] =
            policyGeneration[account][delegatee];

        selectorConfigured[account][delegatee][target][selector] = true;
        selectorPolicies[account][delegatee][target][selector] = isAllowed;

        emit SelectorPolicyUpdated(
            account,
            delegatee,
            target,
            selector,
            isAllowed
        );
    }

    function setSelectorPolicy(
        address delegatee,
        address target,
        bytes4 selector,
        bool isAllowed
    ) external override onlyPolicyAdmin(msg.sender, delegatee) {
        if (target == address(0) || selector == bytes4(0)) {
            revert InvalidSelector();
        }

        selectorPermissionGeneration[msg.sender][delegatee][target][selector] =
            policyGeneration[msg.sender][delegatee];

        selectorConfigured[msg.sender][delegatee][target][selector] = true;
        selectorPolicies[msg.sender][delegatee][target][selector] = isAllowed;

        emit SelectorPolicyUpdated(
            msg.sender,
            delegatee,
            target,
            selector,
            isAllowed
        );
    }

    function isSelectorAllowed(
        address account,
        address delegatee,
        address target,
        bytes4 selector
    ) external view override returns (bool) {
        return
            policies[account][delegatee].isAllowed &&
            targetPolicies[account][delegatee][target].isAllowed &&
            targetPermissionGeneration[account][delegatee][target] ==
                policyGeneration[account][delegatee] &&
            selectorConfigured[account][delegatee][target][selector] &&
            selectorPolicies[account][delegatee][target][selector] &&
            selectorPermissionGeneration[account][delegatee][target][selector] ==
                policyGeneration[account][delegatee];
    }

    // Account-scoped delegation revocation.
    function revokePolicyFor(
        address account,
        address delegatee
    ) external {
        if (account == address(0) || delegatee == address(0)) {
            revert InvalidPolicy();
        }

        Policy storage policy = policies[account][delegatee];

        if (msg.sender != account && msg.sender != policy.admin) {
            revert UnauthorizedAdmin();
        }

        delete policies[account][delegatee];

        // Invalidate previously configured target and selector permissions.
        policyGeneration[account][delegatee] += 1;

        emit PolicyRevoked(account, delegatee);
    }

    function revokePolicy(
        address delegatee
    ) external override onlyPolicyAdmin(msg.sender, delegatee) {
        delete policies[msg.sender][delegatee];
        policyGeneration[msg.sender][delegatee] += 1;

        emit PolicyRevoked(msg.sender, delegatee);
    }

    function validateExecution(
        address account,
        address delegatee,
        address target,
        uint256 value,
        bytes calldata data
    ) external override returns (bool) {
        // Only the account itself may invoke policy validation.
        if (msg.sender != account) revert UnauthorizedAccount();

        Policy memory policy = policies[account][delegatee];

        if (!policy.isAllowed) revert UnauthorizedDelegatee();
        if (block.timestamp > policy.expiryTimestamp) {
            revert PolicyExpired();
        }

        if (
            !targetPolicies[account][delegatee][target].isAllowed ||
            targetPermissionGeneration[account][delegatee][target] !=
                policyGeneration[account][delegatee]
        ) {
            revert TargetNotAllowed();
        }

        if (data.length < 4) revert InvalidSelector();

        bytes4 selector = bytes4(data[:4]);

        if (
            !selectorConfigured[account][delegatee][target][selector] ||
            !selectorPolicies[account][delegatee][target][selector] ||
            selectorPermissionGeneration[account][delegatee][target][selector] !=
                policyGeneration[account][delegatee]
        ) revert SelectorNotAllowed();

        // Reject ERC-20 allowance and third-party transfer operations.
        // These operations are not covered by token spending accounting.
        if (
            selector == 0x095ea7b3 || // approve(address,uint256)
            selector == 0x23b872dd || // transferFrom(address,address,uint256)
            selector == 0x39509351    // increaseAllowance(address,uint256)
        ) {
            revert InvalidTokenCall();
        }

        uint256 currentDay = block.timestamp / 1 days;

        // Native currency limits.
        if (value > 0) {
            if (value > policy.maxNativeSpendPerTx) {
                revert TxLimitExceeded();
            }

            uint256 spent = dailyNativeSpent[account][delegatee][currentDay];

            if (spent + value > policy.dailyNativeSpendLimit) {
                revert DailyLimitExceeded();
            }

            dailyNativeSpent[account][delegatee][currentDay] =
                spent + value;
        }

        // ERC-20 transfer(address,uint256).
        if (selector == 0xa9059cbb) {
            if (data.length != 68) revert InvalidTokenCall();

            TokenPolicy memory tokenPolicy =
                tokenPolicies[account][delegatee][target];

            if (
            !tokenPolicy.isAllowed ||
            tokenPermissionGeneration[account][delegatee][target] !=
                policyGeneration[account][delegatee]
        ) revert TokenNotAllowed();

            uint256 amount;
            assembly {
                amount := calldataload(add(data.offset, 36))
            }

            if (amount > tokenPolicy.maxSpendPerTx) {
                revert TxLimitExceeded();
            }

            uint256 spentToken =
                dailyTokenSpent[account][delegatee][target][currentDay];

            if (spentToken + amount > tokenPolicy.dailySpendLimit) {
                revert DailyLimitExceeded();
            }

            dailyTokenSpent[account][delegatee][target][currentDay] =
                spentToken + amount;
        }

        return true;
    }
}

