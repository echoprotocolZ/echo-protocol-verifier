// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./EchoSmartAccountZ.sol";

contract EchoAccountFactoryZ is EIP712 {
    bytes32 private constant DEPLOY_TYPEHASH = keccak256(
        "Deploy(address owner,address entryPoint,address bridge,address agentPolicyRegistry,bytes32 salt,bytes32 configHash,uint256 deadline)"
    );

    event AccountCreated(
        address indexed account,
        address indexed owner,
        bytes32 indexed salt,
        bytes32 configHash
    );

    error InvalidOwner();
    error InvalidBridge();
    error InvalidAgentPolicyRegistry();
    error InvalidConfiguration();
    error AuthorizationExpired();
    error InvalidSignature();

    // Deployment authority is a temporary security gate, not a substitute
    // for reviewed governance or an independent audit.
    address public stakingCodeAuthority;
    address public pendingStakingCodeAuthority;
    event StakingCodeAuthorityTransferStarted(address indexed currentAuthority, address indexed proposedAuthority);
    event StakingCodeAuthorityTransferred(address indexed previousAuthority, address indexed newAuthority);

    function transferStakingCodeAuthority(address proposed) external {
        if (msg.sender != stakingCodeAuthority || proposed == address(0))
            revert InvalidConfiguration();
        pendingStakingCodeAuthority = proposed;
        emit StakingCodeAuthorityTransferStarted(msg.sender, proposed);
    }

    function acceptStakingCodeAuthority() external {
        if (msg.sender != pendingStakingCodeAuthority || msg.sender == address(0))
            revert InvalidConfiguration();
        address previous = stakingCodeAuthority;
        stakingCodeAuthority = msg.sender;
        pendingStakingCodeAuthority = address(0);
        emit StakingCodeAuthorityTransferred(previous, msg.sender);
    }

    mapping(bytes32 => bool) public approvedStakingCodehash;
    event StakingCodehashApproval(bytes32 indexed codehash, bool approved);

    function setStakingCodehashApproval(bytes32 codehash, bool approved) external {
        if (msg.sender != stakingCodeAuthority || codehash == bytes32(0))
            revert InvalidConfiguration();
        approvedStakingCodehash[codehash] = approved;
        emit StakingCodehashApproval(codehash, approved);
    }

    // Explicit address binding prevents a second deployment with identical
    // runtime code but different constructor-initialized storage from
    // inheriting approval.
    mapping(address => bytes32) public approvedStakingTargetCodehash;
    mapping(address => address) public approvedStakingTargetToken;
    event StakingTargetApproval(address indexed target, address indexed token, bytes32 codehash, bool approved);

    function setStakingTargetApproval(
        address target,
        address token,
        bool approved
    ) external {
        if (msg.sender != stakingCodeAuthority || target == address(0))
            revert InvalidConfiguration();
        if (!approved) {
            delete approvedStakingTargetCodehash[target];
            delete approvedStakingTargetToken[target];
            emit StakingTargetApproval(target, address(0), bytes32(0), false);
            return;
        }
        if (target.code.length == 0 || token.code.length == 0 ||
            !approvedStakingCodehash[target.codehash])
            revert InvalidConfiguration();
        (bool ok, bytes memory response) = target.staticcall(
            abi.encodeWithSignature("echoToken()")
        );
        if (!ok || response.length != 32 ||
            abi.decode(response, (address)) != token)
            revert InvalidConfiguration();
        approvedStakingTargetCodehash[target] = target.codehash;
        approvedStakingTargetToken[target] = token;
        emit StakingTargetApproval(target, token, target.codehash, true);
    }

    function isApprovedStakingTarget(address target) external view returns (bool) {
        return target.code.length != 0 &&
            approvedStakingCodehash[target.codehash] &&
            approvedStakingTargetCodehash[target] == target.codehash &&
            approvedStakingTargetToken[target] != address(0);
    }

    constructor() EIP712("EchoAccountFactoryZ", "1") {
        stakingCodeAuthority = msg.sender;
    }

    function configurationHash(
        address[] calldata targets,
        bytes[] calldata calls
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(targets, calls));
    }

    function deploymentDigest(
        address owner,
        address entryPoint,
        address bridge,
        address agentPolicyRegistry,
        bytes32 salt,
        bytes32 configHash,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    DEPLOY_TYPEHASH,
                    owner,
                    entryPoint,
                    bridge,
                    agentPolicyRegistry,
                    salt,
                    configHash,
                    deadline
                )
            )
        );
    }

    function predictAccountAddress(
        address owner,
        address entryPoint,
        address bridge,
        bytes32 salt
    ) public view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(EchoSmartAccountZ).creationCode,
            abi.encode(
                owner,
                entryPoint,
                bridge,
                address(this)
            )
        );

        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(bytecode)
            )
        );

        return address(uint160(uint256(hash)));
    }

    function createAccount(
        address owner,
        address entryPoint,
        address bridge,
        address agentPolicyRegistry,
        bytes32 salt,
        address[] calldata targets,
        bytes[] calldata calls,
        uint256 deadline,
        bytes calldata signature
    ) external returns (address account) {
        if (owner == address(0)) revert InvalidOwner();
        if (bridge.code.length == 0) revert InvalidBridge();
        if (agentPolicyRegistry.code.length == 0) {
            revert InvalidAgentPolicyRegistry();
        }
        if (targets.length != 5 || calls.length != 5) {
            revert InvalidConfiguration();
        }
        if (block.timestamp > deadline) {
            revert AuthorizationExpired();
        }

        bytes32 configHash = configurationHash(targets, calls);

        bytes32 digest = deploymentDigest(
            owner,
            entryPoint,
            bridge,
            agentPolicyRegistry,
            salt,
            configHash,
            deadline
        );

        if (ECDSA.recover(digest, signature) != owner) {
            revert InvalidSignature();
        }

        account = address(
            new EchoSmartAccountZ{salt: salt}(
                owner,
                entryPoint,
                bridge,
                address(this)
            )
        );

        EchoSmartAccountZ(payable(account)).bindAgentPolicyRegistry(
            agentPolicyRegistry
        );

        EchoSmartAccountZ(payable(account)).initialize(
            targets,
            calls
        );

        emit AccountCreated(
            account,
            owner,
            salt,
            configHash
        );
    }
}
