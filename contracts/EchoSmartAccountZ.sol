// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoSmartAccountV4.sol";
import "./EchoGeographicZoneV4.sol";

interface IEchoReviewedStakingFactory {
    function isApprovedStakingTarget(address target) external view returns (bool);
}


contract EchoSmartAccountZ is EchoSmartAccountV4 {
    address public immutable deploymentFactory;
    bool public initialized;

    address public agentPolicyRegistry;

    // Cumulative ERC-20 spending accounting.
    // Enforcement will be implemented separately.
    mapping(address => mapping(address => uint256))
        public tokenSpendingBudgets;

    mapping(address => mapping(address => uint256))
        public tokenSpendingUsed;


    mapping(address => mapping(address => bool))
        public tokenSpendingBudgetConfigured;

    error InvalidSpendingBudget();

    event TokenSpendingBudgetUpdated(
        address indexed agent,
        address indexed token,
        uint256 budget
    );

    function setTokenSpendingBudget(
        address agent,
        address token,
        uint256 budget
    ) external {
        if (msg.sender != address(this)) revert Unauthorized();
        if (agent == address(0) || token == address(0))
            revert InvalidSpendingBudget();

        if (
            tokenSpendingBudgetConfigured[agent][token] &&
            budget > tokenSpendingBudgets[agent][token]
        ) revert InvalidSpendingBudget();

        if (budget < tokenSpendingUsed[agent][token])
            revert InvalidSpendingBudget();

        address currentToken = monitoredToken[agent];
        if (currentToken != address(0) && currentToken != token)
            revert InvalidSpendingBudget();

        monitoredToken[agent] = token;
        tokenSpendingBudgets[agent][token] = budget;
        tokenSpendingBudgetConfigured[agent][token] = true;

        emit TokenSpendingBudgetUpdated(agent, token, budget);
    }

    // Option A: a staking selector alone does not establish target trust.
    // Bind one explicitly reviewed staking implementation per delegatee.
    mapping(address => address) public trustedStakingTarget;
    event TrustedStakingTargetUpdated(address indexed agent, address indexed target);

    function setTrustedStakingTarget(address agent, address target) external {
        if (msg.sender != address(this)) revert Unauthorized();
        if (agent == address(0) || target == address(0) || target.code.length == 0 ||
            !IEchoReviewedStakingFactory(deploymentFactory).isApprovedStakingTarget(target))
            revert Unauthorized();
        // A change requires a new proof-authorized administrative transaction.
        trustedStakingTarget[agent] = target;
        emit TrustedStakingTargetUpdated(agent, target);
    }

    event TokenSpendingRecorded(
        address indexed agent,
        address indexed token,
        uint256 amount,
        uint256 cumulativeAmount
    );


    // One monitored ERC-20 token per agent.
    mapping(address => address) public monitoredToken;
    mapping(address => uint256) private executionBalanceBefore;

    error SpendingBudgetExceeded();
    error TokenBalanceReadFailed();

    function _tokenBalance(address token)
        internal view returns (uint256)
    {
        (bool ok, bytes memory result) = token.staticcall(
            abi.encodeWithSignature("balanceOf(address)", address(this))
        );
        if (!ok || result.length != 32)
            revert TokenBalanceReadFailed();
        return abi.decode(result, (uint256));
    }

    function _beforeAuthorizedExecution(
        address delegatee,
        address,
        uint256,
        bytes calldata
    ) internal override {
        address token = monitoredToken[delegatee];
        if (token != address(0)) {
            executionBalanceBefore[delegatee] = _tokenBalance(token);
        }
    }

    function _afterAuthorizedExecution(
        address delegatee,
        address,
        uint256,
        bytes calldata
    ) internal override {
        address token = monitoredToken[delegatee];
        if (token == address(0)) return;

        uint256 beforeBalance = executionBalanceBefore[delegatee];
        uint256 afterBalance = _tokenBalance(token);
        if (afterBalance >= beforeBalance) return;

        uint256 spent = beforeBalance - afterBalance;
        uint256 used = tokenSpendingUsed[delegatee][token];
        uint256 budget = tokenSpendingBudgets[delegatee][token];

        if (spent > budget || used > budget - spent)
            revert SpendingBudgetExceeded();

        tokenSpendingUsed[delegatee][token] = used + spent;
        emit TokenSpendingRecorded(delegatee, token, spent, used + spent);
    }


    function _performAuthorizedCall(
        address delegatee,
        address target,
        uint256 value,
        bytes calldata data
    ) internal override returns (bytes memory) {
        if (
            value == 0 &&
            data.length == 36 &&
            bytes4(data[:4]) == bytes4(keccak256("stake(uint256)")) &&
            monitoredToken[delegatee] != address(0)
        ) {
            return _executeAtomicStake(delegatee, target, data);
        }

        return super._performAuthorizedCall(
            delegatee,
            target,
            value,
            data
        );
    }

    // Milestone 8: atomic, proof-authorized ECHO staking.
    // The outer executeAuthorized() call provides V3/V4 verification,
    // nonce handling, policy validation and budget accounting.
    function _executeAtomicStake(
        address delegatee,
        address staking,
        bytes calldata data
    ) internal returns (bytes memory) {
        address token = monitoredToken[delegatee];
        if (token == address(0) || staking.code.length == 0 ||
            staking != trustedStakingTarget[delegatee] ||
            !IEchoReviewedStakingFactory(deploymentFactory).isApprovedStakingTarget(staking))
            revert Unauthorized();

        if (data.length != 36 ||
            bytes4(data[:4]) != bytes4(keccak256("stake(uint256)")))
            revert Unauthorized();

        uint256 amount = abi.decode(data[4:], (uint256));
        if (amount == 0) revert Unauthorized();

        // Require staking contract to identify the monitored token.
        (bool tokenOk, bytes memory tokenResult) =
            staking.staticcall(abi.encodeWithSignature("echoToken()"));

        if (!tokenOk || tokenResult.length != 32 ||
            abi.decode(tokenResult, (address)) != token)
            revert Unauthorized();

        // Reject pre-existing approval instead of silently inheriting it.
        (bool allowanceOk, bytes memory allowanceResult) =
            token.staticcall(
                abi.encodeWithSignature(
                    "allowance(address,address)",
                    address(this),
                    staking
                )
            );

        if (!allowanceOk || allowanceResult.length != 32 ||
            abi.decode(allowanceResult, (uint256)) != 0)
            revert Unauthorized();

        uint256 balanceBeforeStake = _tokenBalance(token);
        if (balanceBeforeStake < amount) revert Unauthorized();

        (bool approved, bytes memory approveResult) =
            token.call(
                abi.encodeWithSignature(
                    "approve(address,uint256)",
                    staking,
                    amount
                )
            );

        if (!approved ||
            (approveResult.length != 0 &&
             (approveResult.length != 32 ||
              !abi.decode(approveResult, (bool)))))
            revert Unauthorized();

        (bool success, bytes memory output) = staking.call(data);
        if (!success) revert ExecutionFailed(output);

        (bool cleared, bytes memory clearResult) =
            token.call(
                abi.encodeWithSignature(
                    "approve(address,uint256)",
                    staking,
                    0
                )
            );

        if (!cleared ||
            (clearResult.length != 0 &&
             (clearResult.length != 32 ||
              !abi.decode(clearResult, (bool)))))
            revert Unauthorized();

        (bool finalOk, bytes memory finalResult) =
            token.staticcall(
                abi.encodeWithSignature(
                    "allowance(address,address)",
                    address(this),
                    staking
                )
            );

        if (
            !finalOk ||
            finalResult.length != 32 ||
            abi.decode(finalResult, (uint256)) != 0
        ) revert Unauthorized();

        uint256 balanceAfterStake = _tokenBalance(token);

        if (
            balanceAfterStake > balanceBeforeStake ||
            balanceBeforeStake - balanceAfterStake != amount
        ) revert Unauthorized();

        return output;
    }

    error InvalidAgentPolicyRegistry();
    error AgentPolicyRegistryAlreadyBound();

    function bindAgentPolicyRegistry(address registry_) external {
        if (msg.sender != deploymentFactory) revert Unauthorized();
        if (initialized || agentPolicyRegistry != address(0)) {
            revert AgentPolicyRegistryAlreadyBound();
        }
        if (registry_ == address(0) || registry_.code.length == 0) {
            revert InvalidAgentPolicyRegistry();
        }

        agentPolicyRegistry = registry_;
    }


    event AccountInitialized(address indexed account);

    error OnlyDeploymentFactory();
    error AlreadyInitialized();
    error InvalidInitializationTarget();
    error InvalidInitializationCall();
    error InitializationFailed(bytes reason);

    constructor(
        address owner_,
        address entryPoint_,
        address bridge_,
        address factory_
    ) EchoSmartAccountV4(owner_, entryPoint_, bridge_) {
        if (factory_ == address(0)) revert InvalidAddress();
        deploymentFactory = factory_;
    }

    function initialize(
        address[] calldata targets,
        bytes[] calldata calls
    ) external {
        if (msg.sender != deploymentFactory) {
            revert OnlyDeploymentFactory();
        }

        if (initialized) revert AlreadyInitialized();

        if (
            targets.length != calls.length ||
            targets.length != 5
        ) revert InvalidInitializationCall();

        address registry = authorizationBridge.checkpointRegistry();

        address dualVerifier = authorizationBridge.dualProofVerifier();

        (bool ok, bytes memory response) = dualVerifier.staticcall(
            abi.encodeWithSignature("v4Gateway()")
        );
        if (!ok || response.length != 32) {
            revert InvalidInitializationTarget();
        }

        address gateway = abi.decode(response, (address));

        (ok, response) = gateway.staticcall(
            abi.encodeWithSignature("policyRegistry()")
        );
        if (!ok || response.length != 32) {
            revert InvalidInitializationTarget();
        }

        address geographicRegistry = abi.decode(response, (address));

        if (
            registry.code.length == 0 ||
            geographicRegistry.code.length == 0
        ) revert InvalidInitializationTarget();

        address[5] memory expectedTargets = [
            registry,
            registry,
            registry,
            address(authorizationBridge),
            geographicRegistry
        ];

        bytes4[5] memory expectedSelectors = [
            bytes4(keccak256("setCheckpointBridge(address,bool)")),
            bytes4(keccak256("setValidatorSigner(address,bool)")),
            bytes4(keccak256("setAttestationPolicy(address,(bytes32,uint64,uint8,bool,bool))")),
            bytes4(keccak256("setAuthorizedDelegatee(address,bool)")),
            bytes4(keccak256("setGeographicPolicy(address,(uint32,uint32,uint32,uint32))"))
        ];


        // Validate complete bootstrap configuration before external calls.
        (address checkpointBridge, bool bridgeEnabled) =
            abi.decode(calls[0][4:], (address, bool));

        (address validator, bool validatorTrusted) =
            abi.decode(calls[1][4:], (address, bool));

        (
            address policyDelegate,
            bytes32 allowedZoneHash,
            uint64 maxTimeDrift,
            uint8 requiredTier,
            bool allowFallback,
            bool policyEnabled
        ) = _decodeAttestationCall(calls[2][4:]);

        (address authorizedDelegate, bool delegateEnabled) =
            abi.decode(calls[3][4:], (address, bool));

        (
            address geographicDelegate,
            EchoGeographicZoneV4.Zone memory zone
        ) = abi.decode(
            calls[4][4:],
            (address, EchoGeographicZoneV4.Zone)
        );

        if (
            checkpointBridge != address(authorizationBridge) ||
            !bridgeEnabled ||
            validator == address(0) ||
            !validatorTrusted ||
            policyDelegate == address(0) ||
            policyDelegate != authorizedDelegate ||
            policyDelegate != geographicDelegate ||
            !delegateEnabled ||
            !policyEnabled ||
            maxTimeDrift == 0 ||
            requiredTier > 2 ||
            (requiredTier == 2 && allowFallback) ||
            allowedZoneHash != EchoGeographicZoneV4.hash(zone)
        ) revert InvalidInitializationCall();

        // Mark initialized before making external calls.
        // A revert rolls this state change back.
        initialized = true;

        for (uint256 i = 0; i < 5; i++) {
            if (
                targets[i] != expectedTargets[i] ||
                targets[i].code.length == 0
            ) revert InvalidInitializationTarget();

            if (calls[i].length < 4) {
                revert InvalidInitializationCall();
            }

            bytes4 selector = bytes4(calls[i][:4]);

            if (selector != expectedSelectors[i]) {
                revert InvalidInitializationCall();
            }

            (bool success, bytes memory result) =
                targets[i].call(calls[i]);

            if (!success) revert InitializationFailed(result);
        }

        emit AccountInitialized(address(this));
    }

    function _decodeAttestationCall(
        bytes calldata encoded
    ) internal pure returns (
        address delegatee,
        bytes32 zoneHash,
        uint64 drift,
        uint8 tier,
        bool fallbackAllowed,
        bool enabled
    ) {
        (
            address decodedDelegate,
            bytes32 decodedZone,
            uint64 decodedDrift,
            uint8 decodedTier,
            bool decodedFallback,
            bool decodedEnabled
        ) = _decodePolicy(encoded);

        return (
            decodedDelegate,
            decodedZone,
            decodedDrift,
            decodedTier,
            decodedFallback,
            decodedEnabled
        );
    }

    function _decodePolicy(
        bytes calldata encoded
    ) internal pure returns (
        address,
        bytes32,
        uint64,
        uint8,
        bool,
        bool
    ) {
        (address delegatee, EchoPolicy memory policy) =
            abi.decode(encoded, (address, EchoPolicy));

        return (
            delegatee,
            policy.allowedZoneHash,
            policy.maxTimeDrift,
            policy.requiredTier,
            policy.allowValidatorFallback,
            policy.enabled
        );
    }

    struct EchoPolicy {
        bytes32 allowedZoneHash;
        uint64 maxTimeDrift;
        uint8 requiredTier;
        bool allowValidatorFallback;
        bool enabled;
    }


    error GeographicUpdatePolicyMismatch();

    event GeographicAdministrationExecuted(
        address indexed policyRegistry,
        bytes32 indexed dataHash,
        uint256 nonce
    );

    /// @notice Updates geographic policy only after owner approval
    /// and successful V3/V4 proof authorization.
    /// @dev Existing V4 unrestricted administration remains disabled.

    /// @dev Enforce account-scoped agent permissions before execution.
    function _validateExecutionPolicy(
        address delegatee,
        address target,
        uint256 value,
        bytes calldata data
    ) internal view override {
        if (target == agentPolicyRegistry) revert Unauthorized();

        // Fail closed for standard ERC-20 spending selectors.
        // Only direct transfer of the budget-monitored token is supported.
        // Persistent allowances are forbidden even for that token.
        // Option A: fail closed. Generic allowlisted external calls can
        // trigger nested transfers of tokens that this account does not
        // monitor. Permit only the monitored token's direct transfer and
        // the separately postcondition-checked atomic staking route.
        address monitored = monitoredToken[delegatee];
        if (value != 0 || data.length != 36 || monitored == address(0)) {
            revert Unauthorized();
        }

        bytes4 operation = bytes4(data[:4]);
        bool monitoredTransfer =
            target == monitored && operation == 0xa9059cbb;
        bool atomicStake =
            operation == bytes4(keccak256("stake(uint256)")) &&
            target.code.length != 0 &&
            target == trustedStakingTarget[delegatee] &&
            IEchoReviewedStakingFactory(deploymentFactory).isApprovedStakingTarget(target);

        if (!monitoredTransfer && !atomicStake) revert Unauthorized();
        if (data.length >= 4) {
            bytes4 selector = bytes4(data[:4]);
            if (
                selector == 0x095ea7b3 || // approve
                selector == 0x39509351 || // increaseAllowance
                selector == 0x23b872dd || // transferFrom
                selector == 0xd505accf || // permit (common EIP-2612)
                selector == 0xa457c2d7 || // decreaseAllowance
                selector == 0x42966c68    // burn(uint256), conservative
            ) revert Unauthorized();

            if (
                selector == 0xa9059cbb && // transfer
                (monitored == address(0) || target != monitored)
            ) revert Unauthorized();
        }

        if (!initialized || agentPolicyRegistry.code.length == 0) {
            revert InvalidAgentPolicyRegistry();
        }

        (bool success, bytes memory response) =
            agentPolicyRegistry.staticcall(
                abi.encodeWithSignature(
                    "validateExecution(address,address,address,uint256,bytes)",
                    address(this),
                    delegatee,
                    target,
                    value,
                    data
                )
            );

        if (!success || response.length != 32 ||
            !abi.decode(response, (bool))) {
            revert Unauthorized();
        }
    }


    error InvalidAgentPolicyUpdate();

    function _validateAgentPolicyUpdate(
        address delegatee,
        bytes calldata data
    ) internal pure {
        if (delegatee == address(0) || data.length < 4) {
            revert InvalidAgentPolicyUpdate();
        }

        bytes4 selector = bytes4(data[:4]);

        if (selector == bytes4(
            keccak256("setAgentPolicy(address,uint256,uint64,bool)")
        )) {
            if (data.length != 132) revert InvalidAgentPolicyUpdate();

            (address agent,,,) = abi.decode(
                data[4:], (address,uint256,uint64,bool)
            );

            if (agent != delegatee) revert InvalidAgentPolicyUpdate();

        } else if (selector == bytes4(
            keccak256("setTargetPermission(address,address,bool)")
        )) {
            if (data.length != 100) revert InvalidAgentPolicyUpdate();

            (address agent,,) = abi.decode(
                data[4:], (address,address,bool)
            );

            if (agent != delegatee) revert InvalidAgentPolicyUpdate();

        } else if (selector == bytes4(
            keccak256("setSelectorPermission(address,address,bytes4,bool)")
        )) {
            if (data.length != 132) revert InvalidAgentPolicyUpdate();

            (address agent,,,) = abi.decode(
                data[4:], (address,address,bytes4,bool)
            );

            if (agent != delegatee) revert InvalidAgentPolicyUpdate();

        } else if (selector == bytes4(
            keccak256("setTokenApprovalLimit(address,address,address,uint256)")
        )) {
            if (data.length != 132) revert InvalidAgentPolicyUpdate();

            (address agent, address token, address spender,) = abi.decode(
                data[4:], (address,address,address,uint256)
            );

            if (
                agent != delegatee ||
                token == address(0) ||
                spender == address(0)
            ) revert InvalidAgentPolicyUpdate();

        } else {
            revert InvalidAgentPolicyUpdate();
        }
    }


    event AgentPolicyAdministrationExecuted(
        address indexed agent,
        bytes32 indexed dataHash,
        uint256 nonceUsed
    );


    struct AgentPolicyProof {
        uint[2] v3A;
        uint[2][2] v3B;
        uint[2] v3C;
        uint[20] v3Signals;
        uint[2] v4A;
        uint[2][2] v4B;
        uint[2] v4C;
        uint[5] v4Signals;
    }


    function executeProofAuthorizedSpendingBudgetUpdate(
        IEchoAuthorizationBridgeForAccountV4.SignedCheckpoint calldata checkpoint,
        bytes calldata signature,
        AgentPolicyProof calldata proof,
        address token,
        uint256 budget
    ) external nonReentrantExecution {
        if (!initialized || msg.sender != owner) revert Unauthorized();
        if (checkpoint.account != address(this)) revert Unauthorized();
        if (checkpoint.delegatee == address(0) || token == address(0))
            revert InvalidSpendingBudget();

        bytes memory budgetData = abi.encodeWithSelector(
            this.setTokenSpendingBudget.selector,
            checkpoint.delegatee,
            token,
            budget
        );

        uint256 currentNonce = nonce;

        bool authorized = authorizationBridge.authorize(
            checkpoint,
            signature,
            proof.v3A,
            proof.v3B,
            proof.v3C,
            proof.v3Signals,
            proof.v4A,
            proof.v4B,
            proof.v4C,
            proof.v4Signals,
            address(this),
            0,
            budgetData,
            currentNonce
        );

        if (!authorized) revert AuthorizationFailed();

        nonce = currentNonce + 1;

        (bool success, bytes memory output) =
            address(this).call(budgetData);

        if (!success) revert ExecutionFailed(output);
    }

    function executeProofAuthorizedStakingTargetUpdate(
        IEchoAuthorizationBridgeForAccountV4.SignedCheckpoint calldata checkpoint,
        bytes calldata signature,
        AgentPolicyProof calldata proof,
        address target
    ) external nonReentrantExecution {
        if (!initialized || msg.sender != owner) revert Unauthorized();
        if (checkpoint.account != address(this) ||
            checkpoint.delegatee == address(0) ||
            target == address(0) || target.code.length == 0 ||
            !IEchoReviewedStakingFactory(deploymentFactory).isApprovedStakingTarget(target))
            revert Unauthorized();

        bytes memory callData = abi.encodeWithSelector(
            this.setTrustedStakingTarget.selector,
            checkpoint.delegatee,
            target
        );
        uint256 currentNonce = nonce;
        bool authorized = authorizationBridge.authorize(
            checkpoint, signature,
            proof.v3A, proof.v3B, proof.v3C, proof.v3Signals,
            proof.v4A, proof.v4B, proof.v4C, proof.v4Signals,
            address(this), 0, callData, currentNonce
        );
        if (!authorized) revert AuthorizationFailed();
        nonce = currentNonce + 1;
        (bool success, bytes memory output) = address(this).call(callData);
        if (!success) revert ExecutionFailed(output);
    }

    function executeProofAuthorizedAgentPolicyUpdate(
        IEchoAuthorizationBridgeForAccountV4.SignedCheckpoint calldata checkpoint,
        bytes calldata signature,
        AgentPolicyProof calldata proof,
        bytes calldata data
    ) external nonReentrantExecution returns (bytes memory) {
        if (!initialized || msg.sender != owner) revert Unauthorized();
        if (checkpoint.account != address(this)) revert Unauthorized();
        if (agentPolicyRegistry.code.length == 0) {
            revert InvalidAgentPolicyRegistry();
        }

        _validateAgentPolicyUpdate(checkpoint.delegatee, data);

        uint256 currentNonce = nonce;

        bool authorized = authorizationBridge.authorize(
            checkpoint,
            signature,
            proof.v3A,
            proof.v3B,
            proof.v3C,
            proof.v3Signals,
            proof.v4A,
            proof.v4B,
            proof.v4C,
            proof.v4Signals,
            agentPolicyRegistry,
            0,
            data,
            currentNonce
        );

        if (!authorized) revert AuthorizationFailed();

        nonce = currentNonce + 1;

        (bool success, bytes memory output) =
            agentPolicyRegistry.call(data);

        if (!success) revert ExecutionFailed(output);

        emit AgentPolicyAdministrationExecuted(
            checkpoint.delegatee,
            keccak256(data),
            currentNonce
        );

        return output;
    }

    function executeProofAuthorizedGeographicUpdate(
        IEchoAuthorizationBridgeForAccountV4.SignedCheckpoint calldata checkpoint,
        bytes calldata signature,
        uint[2] calldata v3A,
        uint[2][2] calldata v3B,
        uint[2] calldata v3C,
        uint[20] calldata v3Signals,
        uint[2] calldata v4A,
        uint[2][2] calldata v4B,
        uint[2] calldata v4C,
        uint[5] calldata v4Signals,
        bytes calldata data
    ) external nonReentrantExecution returns (bytes memory result) {
        if (!initialized || msg.sender != owner) revert Unauthorized();
        if (checkpoint.account != address(this)) revert Unauthorized();

        // This entry point permits only geographic policy updates.
        if (data.length < 4) revert InvalidInitializationCall();

        bytes4 selector = bytes4(data[:4]);

        if (
            selector != bytes4(
                keccak256(
                    "setGeographicPolicy(address,(uint32,uint32,uint32,uint32))"
                )
            )
        ) revert InvalidInitializationCall();

        address dualVerifier = authorizationBridge.dualProofVerifier();

        if (dualVerifier.code.length == 0) revert InvalidAddress();

        (bool ok, bytes memory response) = dualVerifier.staticcall(
            abi.encodeWithSignature("v4Gateway()")
        );

        if (!ok || response.length != 32) revert InvalidAddress();

        address gateway = abi.decode(response, (address));

        if (gateway.code.length == 0) revert InvalidAddress();

        (ok, response) = gateway.staticcall(
            abi.encodeWithSignature("policyRegistry()")
        );

        if (!ok || response.length != 32) revert InvalidAddress();

        address policyRegistry = abi.decode(response, (address));

        if (policyRegistry.code.length == 0) revert InvalidAddress();


        // Bind the geographic update to the delegatee's existing
        // account-scoped attestation policy.
        (
            address delegatee,
            EchoGeographicZoneV4.Zone memory requestedZone
        ) = abi.decode(
            data[4:],
            (address, EchoGeographicZoneV4.Zone)
        );

        address registry = authorizationBridge.checkpointRegistry();
        if (registry.code.length == 0) revert InvalidAddress();

        (ok, response) = registry.staticcall(
            abi.encodeWithSignature(
                "attestationPolicies(address,address)",
                address(this),
                delegatee
            )
        );

        if (!ok || response.length != 160) {
            revert GeographicUpdatePolicyMismatch();
        }

        (
            bytes32 allowedZoneHash,
            uint64 maxTimeDrift,
            uint8 requiredTier,
            bool allowFallback,
            bool policyEnabled
        ) = abi.decode(
            response,
            (bytes32, uint64, uint8, bool, bool)
        );

        // Avoid unused-variable warnings while retaining full
        // policy tuple decoding.
        maxTimeDrift;
        requiredTier;
        allowFallback;

        if (
            !policyEnabled ||
            allowedZoneHash != EchoGeographicZoneV4.hash(requestedZone)
        ) revert GeographicUpdatePolicyMismatch();

        uint256 currentNonce = nonce;

        bool authorized = authorizationBridge.authorize(
            checkpoint,
            signature,
            v3A,
            v3B,
            v3C,
            v3Signals,
            v4A,
            v4B,
            v4C,
            v4Signals,
            policyRegistry,
            0,
            data,
            currentNonce
        );

        if (!authorized) revert AuthorizationFailed();

        nonce = currentNonce + 1;

        (bool success, bytes memory output) =
            policyRegistry.call(data);

        if (!success) revert ExecutionFailed(output);

        emit GeographicAdministrationExecuted(
            policyRegistry,
            keccak256(data),
            currentNonce
        );

        return output;
    }


    event ZoneMigrationExecuted(
        address indexed delegatee,
        bytes32 oldZoneHash,
        bytes32 newZoneHash,
        uint256 nonceUsed
    );

    error InvalidZoneMigration();

    function executeProofAuthorizedZoneMigration(
        IEchoAuthorizationBridgeForAccountV4.SignedCheckpoint calldata checkpoint,
        bytes calldata signature,
        uint[2] calldata v3A,
        uint[2][2] calldata v3B,
        uint[2] calldata v3C,
        uint[20] calldata v3Signals,
        uint[2] calldata v4A,
        uint[2][2] calldata v4B,
        uint[2] calldata v4C,
        uint[5] calldata v4Signals,
        address delegatee,
        EchoGeographicZoneV4.Zone calldata newZone
    ) external nonReentrantExecution {
        if (!initialized || msg.sender != owner) revert Unauthorized();
        if (checkpoint.account != address(this)) revert Unauthorized();
        if (
            delegatee == address(0) ||
            checkpoint.delegatee != delegatee
        ) revert InvalidZoneMigration();

        address registry = authorizationBridge.checkpointRegistry();
        address dualVerifier = authorizationBridge.dualProofVerifier();

        (bool ok, bytes memory response) = dualVerifier.staticcall(
            abi.encodeWithSignature("v4Gateway()")
        );
        if (!ok || response.length != 32) revert InvalidAddress();

        address gateway = abi.decode(response, (address));
        if (gateway.code.length == 0) revert InvalidAddress();

        (ok, response) = gateway.staticcall(
            abi.encodeWithSignature("policyRegistry()")
        );
        if (!ok || response.length != 32) revert InvalidAddress();

        address geographicRegistry = abi.decode(response, (address));
        if (
            geographicRegistry.code.length == 0 ||
            registry.code.length == 0
        ) revert InvalidAddress();

        (ok, response) = registry.staticcall(
            abi.encodeWithSignature(
                "attestationPolicies(address,address)",
                address(this),
                delegatee
            )
        );
        if (!ok || response.length != 160) {
            revert InvalidZoneMigration();
        }

        (
            bytes32 oldZoneHash,
            uint64 maxTimeDrift,
            uint8 requiredTier,
            bool allowFallback,
            bool enabled
        ) = abi.decode(
            response,
            (bytes32, uint64, uint8, bool, bool)
        );

        if (!enabled || oldZoneHash == bytes32(0)) {
            revert InvalidZoneMigration();
        }

        // Existing attestation and geographic policies must agree.
        (ok, response) = geographicRegistry.staticcall(
            abi.encodeWithSignature(
                "getGeographicPolicy(address,address)",
                address(this),
                delegatee
            )
        );

        if (!ok) revert InvalidZoneMigration();

        (
            EchoGeographicZoneV4.Zone memory existingZone,
            bytes32 geographicZoneHash,
            bool geographicEnabled
        ) = abi.decode(
            response,
            (EchoGeographicZoneV4.Zone, bytes32, bool)
        );

        if (
            !geographicEnabled ||
            geographicZoneHash != oldZoneHash ||
            EchoGeographicZoneV4.hash(existingZone) != oldZoneHash
        ) revert InvalidZoneMigration();

        bytes32 newZoneHash = EchoGeographicZoneV4.hash(newZone);
        if (newZoneHash == oldZoneHash) revert InvalidZoneMigration();

        // Bind the proof to the entire migration request.
        bytes memory migrationData = abi.encodeWithSelector(
            this.executeProofAuthorizedZoneMigration.selector,
            delegatee,
            newZone,
            oldZoneHash,
            maxTimeDrift,
            requiredTier,
            allowFallback
        );

        uint256 currentNonce = nonce;

        bool authorized = authorizationBridge.authorize(
            checkpoint,
            signature,
            v3A,
            v3B,
            v3C,
            v3Signals,
            v4A,
            v4B,
            v4C,
            v4Signals,
            address(this),
            0,
            migrationData,
            currentNonce
        );

        if (!authorized) revert AuthorizationFailed();

        nonce = currentNonce + 1;

        // Update the attestation policy without changing its security tier.
        bytes memory policyCallData = abi.encodePacked(
            bytes4(
                keccak256(
                    "setAttestationPolicy(address,(bytes32,uint64,uint8,bool,bool))"
                )
            ),
            abi.encode(
                delegatee,
                newZoneHash,
                maxTimeDrift,
                requiredTier,
                allowFallback,
                true
            )
        );

        (bool attestationSuccess, bytes memory attestationResult) =
            registry.call(policyCallData);

        if (!attestationSuccess) {
            revert ExecutionFailed(attestationResult);
        }

        // Update the geographic policy in the same transaction.
        (bool geographicSuccess, bytes memory geographicResult) =
            geographicRegistry.call(
                abi.encodeWithSignature(
                    "setGeographicPolicy(address,(uint32,uint32,uint32,uint32))",
                    delegatee,
                    newZone
                )
            );

        if (!geographicSuccess) {
            revert ExecutionFailed(geographicResult);
        }

        emit ZoneMigrationExecuted(
            delegatee,
            oldZoneHash,
            newZoneHash,
            currentNonce
        );
    }

}
