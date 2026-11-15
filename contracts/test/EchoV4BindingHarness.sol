// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../EchoAuthorizationBridgeV4.sol";

/// @dev TEST ONLY: exposes pure/view binding checks, never deploy to mainnet.
contract EchoV4BindingHarness is EchoAuthorizationBridgeV4 {
    constructor(address dual,address registry) EchoAuthorizationBridgeV4(dual,registry) {}
    function checkTransaction(
        uint[20] calldata signals,address target,uint256 value,bytes calldata data,uint256 nonce
    ) external view { _validateTransactionBinding(signals,target,value,data,nonce); }
    function checkCheckpoint(
        SignedCheckpoint calldata checkpoint,uint[20] calldata signals
    ) external pure { _validateCheckpointBinding(checkpoint,signals); }
}
