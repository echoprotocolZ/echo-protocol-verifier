// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
interface ISlashTarget { function slash(address validator, bytes32 incidentId) external; }
contract EchoStakingAuthorityForwarderFixture {
    ISlashTarget public immutable staking;
    constructor(address target) { staking = ISlashTarget(target); }
    function slash(address validator, bytes32 incidentId) external { staking.slash(validator, incidentId); }
}
