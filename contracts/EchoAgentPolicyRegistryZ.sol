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

        return true;
    }
}
