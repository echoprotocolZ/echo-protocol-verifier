# Historical Amoy execution evidence

User supplied RPC receipt: chain 80002, status SUCCESS, block 52267020, block hash 0x94c0648d53d718491a41d9291670ea5e1211bdf538a6c4f345ee5b41caed05ad, transaction 0xd69418d69922d25357a4c911442ec7d185b82dbfbf0f865faaec32323a84dafb, gas used 1167874. From 0xbD2dEf17C60C3f6C2dA6eE812F948f4B53f2f803 to original V4 account 0xeC7cd7D39BC3997354906aB268bE374d7F8eB286; selector 0xd53aa9f8. Target 0x4249b56F27Af8f43fdf859F761D1D57307b77a15 currently reports 888.

Receipt protocol log topics in order: registry 0x2626b3520deea4fcebe2bb7ed2c7effcceb67b455bdf9a79522dbbf67e0f141c; bridge 0xa2866328df8ac0a03031d8e1a27816b60094b7c2e5cabe06242d19d65666cfca; bridge 0x8ea77031fe1d7486b87b4ba719c52759205a5bad3d5ffa1d3f5ecbd14f99e6bc; account 0x172496cba6934f7ad29d2663464f0cd2fe4d2d42e6959038639c71c6d0ce0318. Current source declares CheckpointConsumed(address,address,bytes32), NullifierConsumed(address,uint256), AuthorizationConsumed(address,uint256,address,uint256), Executed(address,uint256,bytes,uint256). Structural correspondence only; cryptographic topic and selector matching not yet completed. Account event data contains 0x55241077 and argument 0x378 (888).

Evidence supports successful historical original-account execution. Independently reproduce receipt, decode calldata and events, and establish historical runtime/verifier provenance before stronger proof claims. Does not establish live execution by bootstrapped, delegation candidate or Z accounts. Do not repeat historical transaction or change deployment flags based on this evidence alone.

## ABI correspondence follow-up
User supplied terminal output confirms all five Keccak checks passed: four event topics and executeAuthorized selector. This resolves signature correspondence, not historical runtime equivalence or independent receipt reproduction. Original V4 historical execution need not be repeated for this gate.
