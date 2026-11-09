// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Account-scoped AI agent execution policies.
/// @dev A policy is configured by its owning smart account.
contract EchoAgentPolicyRegistryZ {
    struct AgentPolicy {
        uint256 maxValuePerTransaction;
        uint64 expiresAt;
        bool enabled;
    }

    mapping(address => mapping(address => AgentPolicy))
        public agentPolicies;

    mapping(address => mapping(address => mapping(address => bool)))
        public approvedTargets;

    mapping(address => mapping(address => mapping(address => mapping(bytes4 => bool))))
        public approvedSelectors;


    mapping(address => mapping(address => mapping(address => mapping(address => uint256))))
        public tokenApprovalLimits;

    mapping(address => mapping(address => bool))
        public protectedTokens;

    event TokenApprovalLimitUpdated(
        address indexed account,
        address indexed agent,
        address indexed token,
        address spender,
        uint256 limit
    );

    event AgentPolicyUpdated(
        address indexed account,
        address indexed agent,
        uint256 maxValuePerTransaction,
        uint64 expiresAt,
        bool enabled
    );

    event TargetPermissionUpdated(
        address indexed account,
        address indexed agent,
        address indexed target,
        bool approved
    );

    event SelectorPermissionUpdated(
        address indexed account,
        address indexed agent,
        address indexed target,
        bytes4 selector,
        bool approved
    );

    error InvalidAgent();
    error InvalidTarget();
    error InvalidExpiration();
    error PolicyNotActive();
    error TargetNotApproved();
    error SelectorNotApproved();
    error SpendingLimitExceeded();


    function setProtectedToken(address token, bool protected_) external {
        if (token == address(0)) revert InvalidTarget();
        protectedTokens[msg.sender][token] = protected_;
    }

    function setTokenApprovalLimit(
        address agent,
        address token,
        address spender,
        uint256 limit
    ) external {
        if (agent == address(0)) revert InvalidAgent();
        if (token == address(0) || spender == address(0))
            revert InvalidTarget();

        tokenApprovalLimits[msg.sender][agent][token][spender] = limit;

        emit TokenApprovalLimitUpdated(
            msg.sender, agent, token, spender, limit
        );
    }

    function setAgentPolicy(
        address agent,
        uint256 maxValuePerTransaction,
        uint64 expiresAt,
        bool enabled
    ) external {
        if (agent == address(0)) revert InvalidAgent();
        if (enabled && expiresAt <= block.timestamp)
            revert InvalidExpiration();

        agentPolicies[msg.sender][agent] = AgentPolicy({
            maxValuePerTransaction: maxValuePerTransaction,
            expiresAt: expiresAt,
            enabled: enabled
        });

        emit AgentPolicyUpdated(
            msg.sender,
            agent,
            maxValuePerTransaction,
            expiresAt,
            enabled
        );
    }

    function setTargetPermission(
        address agent,
        address target,
        bool approved
    ) external {
        if (agent == address(0)) revert InvalidAgent();
        if (target == address(0)) revert InvalidTarget();

        approvedTargets[msg.sender][agent][target] = approved;

        emit TargetPermissionUpdated(
            msg.sender,
            agent,
            target,
            approved
        );
    }

    function setSelectorPermission(
        address agent,
        address target,
        bytes4 selector,
        bool approved
    ) external {
        if (agent == address(0)) revert InvalidAgent();
        if (target == address(0)) revert InvalidTarget();

        approvedSelectors[msg.sender][agent][target][selector] = approved;

        emit SelectorPermissionUpdated(
            msg.sender,
            agent,
            target,
            selector,
            approved
        );
    }

    function validateExecution(
        address account,
        address agent,
        address target,
        uint256 value,
        bytes calldata data
    ) external view returns (bool) {
        AgentPolicy memory policy = agentPolicies[account][agent];

        if (!policy.enabled || block.timestamp >= policy.expiresAt)
            revert PolicyNotActive();

        if (!approvedTargets[account][agent][target])
            revert TargetNotApproved();

        if (value > policy.maxValuePerTransaction)
            revert SpendingLimitExceeded();

        if (data.length < 4)
            revert SelectorNotApproved();

        bytes4 selector = bytes4(data[:4]);

        if (!approvedSelectors[account][agent][target][selector])
            revert SelectorNotApproved();


        if (selector == 0x095ea7b3) {
            // ERC-20 approve(address,uint256).
            // Require canonical calldata and explicit spender allowance.
            if (data.length != 68) revert SpendingLimitExceeded();

            (address spender, uint256 amount) =
                abi.decode(data[4:], (address, uint256));

            uint256 limit =
                tokenApprovalLimits[account][agent][target][spender];

            if (limit == 0 || amount > limit)
                revert SpendingLimitExceeded();
        }

        // Protected tokens cannot be moved through transfer/transferFrom.
        if (protectedTokens[account][target] &&
            (selector == 0xa9059cbb || selector == 0x23b872dd))
            revert SpendingLimitExceeded();

        return true;
    }
}
