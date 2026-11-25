# Polygon authority snapshot — user supplied RPC output

Chain 137; block 97903160; hash 0x3345cd170dd2f3e1dfba8bdfa1d4c7e59de7fa40a61a7ee90e62f05d580370e7. Provider publicnode; audit script commit 0334be5. Not independently reproduced.

| Contract | Address | Runtime bytes | Runtime keccak256 |
|---|---|---:|---|
| Canonical token | 0x9511Ee84398B8Deb725d8967c16693C96C43e0eD | 3610 | 0x879dc245000854879500ab535e9a31ec4ac2e62b1ced8d653f9ef531d1a798f7 |
| Staking | 0x11bddDCE9770687675Afdef5AA9F001fcC837E4B | 16123 | 0x4224ab14ea3d08208b1a3d7081f988e3b902e7206cce6096f4ee3d1bdb1e7ba3 |
| Registry | 0x25DB74bbDa04F5a83b386f74Bb16B929f1419B31 | 8256 | 0x0acd4151eb7b8afd244b17a86b645997f780301ce781c41ff8f013caed3b7288 |
| Paymaster | 0x1A69EA821c497B4d2908f972b918664dF17a9bC4 | missing | unresolved |
| Delegation proxy | 0x93Fb207d8832a8A2914194098901b8E1b39A04c1 | missing | unresolved |

Token supply 100000000000000000000000000 raw, decimals 18, owner getter CALL_EXCEPTION. Staking token binding canonical; owner and registry owner both 0x10fA94fBFd8EB1B8086b10e6eF7a141A11f231df. Staking registryAddress and forensicOracle zero; paused false; totalStaked and rewardPool zero; minimumStake 1000000000000000000000 raw.

Release blockers: corroborate missing runtime at same block with independent provider; reconcile deployment receipts and chain/address records; establish owner custody and governance, registry/oracle policy and exact runtime provenance. Zero accounting balances do not establish actual token balance. Missing runtime does not prove never deployed. Do not configure, fund or redeploy without separate approval.
