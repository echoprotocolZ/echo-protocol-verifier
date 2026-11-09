// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EchoSmartAccountV4.sol";
import "./EchoGeographicZoneV4.sol";

contract EchoSmartAccountZ is EchoSmartAccountV4 {
    address public immutable deploymentFactory;
    bool public initialized;

    address public agentPolicyRegistry;
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
