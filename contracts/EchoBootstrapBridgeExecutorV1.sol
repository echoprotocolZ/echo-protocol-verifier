// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Experimental replacement-account bootstrap executor, NOT wired to live V4.
/// @dev Deploy only after independent enrollment-root authentication and a reviewed
///      deterministic deployment procedure for binding gate.account to this address.
interface IEchoBootstrapGateForExecutor {
    function account() external view returns (address);
    function registry() external view returns (address);
    function verifyBootstrapProof(
        uint256[2] calldata a, uint256[2][2] calldata b,
        uint256[2] calldata c, uint256[6] calldata input
    ) external view returns (bool);
}
interface IEchoBootstrapRegistryForExecutor {
    function setCheckpointBridge(address bridge, bool authorized) external;
}
contract EchoBootstrapBridgeExecutorV1 {
    uint256 internal constant FIELD_MODULUS =
        21888242871839275222246405745257275088696311157297823662689037894645226208583;
    bytes32 internal constant ACTION_DOMAIN = keccak256("ECHO_BOOTSTRAP_BRIDGE_EXECUTOR_V1");
    IEchoBootstrapGateForExecutor public immutable gate;
    IEchoBootstrapRegistryForExecutor public immutable registry;
    uint256 public nextNonce;
    bool private entered;
    mapping(uint256 => bool) public usedNullifiers;

    error InvalidConfiguration();
    error InvalidAction();
    error Expired();
    error Replay();
    error Reentrancy();
    error VerificationFailed();

    constructor(address gate_, address registry_) {
        if (gate_.code.length == 0 || registry_.code.length == 0) revert InvalidConfiguration();
        IEchoBootstrapGateForExecutor g = IEchoBootstrapGateForExecutor(gate_);
        if (g.account() != address(this) || g.registry() != registry_) revert InvalidConfiguration();
        gate = g;
        registry = IEchoBootstrapRegistryForExecutor(registry_);
    }

    function actionHash(address bridge, bool authorized, uint256 nonce, uint256 deadline)
        public view returns (uint256)
    {
        return uint256(keccak256(abi.encode(
            ACTION_DOMAIN, address(this), block.chainid, address(registry),
            bridge, authorized, nonce, deadline
        ))) % FIELD_MODULUS;
    }

    /// @notice Exactly one account-scoped registry setter, with no arbitrary calls.
    /// @dev Input order: trustedRoot, account, chainId, nonce, actionHash, nullifier.
    function configureCheckpointBridge(
        address bridge, bool authorized, uint256 deadline,
        uint256[2] calldata a, uint256[2][2] calldata b,
        uint256[2] calldata c, uint256[6] calldata input
    ) external {
        if (entered) revert Reentrancy();
        entered = true;
        if (block.timestamp > deadline) revert Expired();
        if (bridge.code.length == 0) revert InvalidAction();
        if (
            input[1] != uint256(uint160(address(this))) ||
            input[2] != block.chainid ||
            input[3] != nextNonce ||
            input[4] != actionHash(bridge, authorized, nextNonce, deadline) ||
            input[5] == 0
        ) revert InvalidAction();
        if (usedNullifiers[input[5]]) revert Replay();
        if (!gate.verifyBootstrapProof(a, b, c, input)) revert VerificationFailed();
        usedNullifiers[input[5]] = true;
        nextNonce++;
        registry.setCheckpointBridge(bridge, authorized);
        entered = false;
    }
}
