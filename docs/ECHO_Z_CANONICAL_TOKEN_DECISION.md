# Canonical ECHO token decision — 2026-11-24

Founder approved retaining the original Polygon chain 137 token at `0x9511Ee84398B8Deb725d8967c16693C96C43e0eD`. On-chain name Echo Token, symbol Echo, decimals 18. User-provided RPC output reports supply and named wallet balance of 100,000,000 each; runtime hash `0x879dc245000854879500ab535e9a31ec4ac2e62b1ced8d653f9ef531d1a798f7`. Screenshot of explorer source shows ERC20 inheritance and constructor-only mint, no Ownable inheritance. owner() revert is consistent with that source. Exact source reproduction and snapshot block evidence remain outstanding.

The separate token `0x5C2933c98a871F14329E028e22AE39Eb7A70A6Cc` (symbol ECHO) is excluded from official allocation and must remain untouched. No burn, transfer or deployment authorized.

Production integration must not require token owner privileges or ERC20Burnable methods. Verify staking and slashing compatibility, all token bindings, custody, and exact deployed runtime before release. This decision does not authorize mainnet transactions or supersede independent audit requirements.
