# Z release dependency matrix

Source inspection on security branch: EchoSmartAccountZ, EchoAccountFactoryZ, EchoSmartAccountV4, EchoAuthorizationBridgeV4, EchoDualProofVerifierV4, EchoGeographicProofGatewayV4, EchoAuthorizationBridgeV3.

- Factory Z creates Z account with owner, EntryPoint, V4 bridge and agent policy registry; reviewed staking target approval required for staking paths.
- Z inherits V4 account; V4 account has immutable authorizationBridge and configured entryPoint.
- V4 bridge references dual proof verifier and V3 checkpoint registry.
- Dual proof verifier references V3 bridge and V4 geographic gateway.
- V3 bridge references Groth16 verifier and checkpoint registry.
- Geographic gateway references geographic verifier and geographic policy registry.

Legacy Paymaster and DelegationProxy are not direct dependencies in these inspected files. This does not establish exhaustive off-chain or transitive independence. V4 source references a future proof-authorized EntryPoint; no validateUserOp implementation was found in inspected V4 source. Do not claim ERC-4337 compliance or gas sponsorship without separate integration evidence.

Release acceptance: verify each dependency runtime, constructor binding, chain and authority at pinned block; prove account initialization, registry authorization, policy binding, real dual proof execution and rollback on intended deployment. Verify staking target approval and actual canonical token binding. Keep existing Polygon deployments unchanged. Amoy evidence is not mainnet deployment evidence. No production transactions authorized.
