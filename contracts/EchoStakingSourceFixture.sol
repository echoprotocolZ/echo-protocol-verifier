// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @notice Owner-supplied EchoStaking source, for local regression testing only.
 * NOT verified against deployed Polygon runtime bytecode. Do not deploy this fixture.
 */
contract EchoStakingSourceFixture is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    uint256 public constant MIN_STAKE = 1_000 ether;
    uint256 public constant SLASHING_PENALTY = 100 ether;
    uint256 public constant MAX_CLOCK_DRIFT_MS = 500;
    uint256 public constant LOCK_PERIOD = 90 days;
    uint256 public constant UNBONDING_PERIOD = 24 hours;
    uint256 public constant SLASH_COOLDOWN = 24 hours;
    IERC20 public immutable echoToken;
    address public registryAddress;
    address public forensicOracle;
    uint256 public totalStaked;
    uint256 public rewardPool;
    struct ValidatorInfo {
        uint256 stakedAmount;
        uint256 unlockTime;
        uint256 unstakeRequestedAt;
        uint256 lastSlashedAt;
        bool isActive;
        bool isQuarantined;
    }
    mapping(address => ValidatorInfo) public validators;
    mapping(bytes32 => bool) public processedIncidents;
    event Staked(address indexed validator, uint256 amount);
    event UnstakeRequested(address indexed validator, uint256 availableAt);
    event Withdrawn(address indexed validator, uint256 amount);
    event Slashed(address indexed validator, uint256 amount, bytes32 indexed incidentId);
    event NodeQuarantined(address indexed validator);
    event RewardFunded(address indexed funder, uint256 amount);
    event RewardDistributed(address indexed validator, uint256 amount);
    event RegistryAddressUpdated(address indexed registry);
    event ForensicOracleUpdated(address indexed oracle);
    event ValidatorReactivated(address indexed validator);
    event TotalStakedUpdated(uint256 newTotal);
    event RewardPoolUpdated(uint256 newTotal);
    event ExcessTokenRescued(address indexed token, address indexed recipient, uint256 amount);

    modifier onlyForensicAuthority() {
        require(msg.sender == owner() ||
            (forensicOracle != address(0) && msg.sender == forensicOracle) ||
            (registryAddress != address(0) && msg.sender == registryAddress), "Not authorized");
        _;
    }
    constructor(address tokenAddress) Ownable(msg.sender) {
        require(tokenAddress != address(0), "Invalid token address");
        require(tokenAddress.code.length > 0, "Token must be a contract");
        echoToken = IERC20(tokenAddress);
    }
    function setRegistryAddress(address registry) external onlyOwner {
        if (registry != address(0)) require(registry.code.length > 0, "Registry must be a contract");
        registryAddress = registry;
        emit RegistryAddressUpdated(registry);
    }
    function setForensicOracle(address oracle) external onlyOwner {
        forensicOracle = oracle;
        emit ForensicOracleUpdated(oracle);
    }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
    function stake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Invalid amount");
        ValidatorInfo storage v = validators[msg.sender];
        require(!v.isQuarantined, "Validator quarantined");
        require(v.unstakeRequestedAt == 0, "Unstaking pending");
        uint256 beforeBalance = echoToken.balanceOf(address(this));
        echoToken.safeTransferFrom(msg.sender, address(this), amount);
        require(echoToken.balanceOf(address(this)) - beforeBalance == amount, "Transfer amount mismatch");
        v.stakedAmount += amount;
        totalStaked += amount;
        require(v.stakedAmount >= MIN_STAKE, "Below minimum stake");
        if (v.unlockTime < block.timestamp) v.unlockTime = block.timestamp + LOCK_PERIOD;
        v.isActive = true;
        emit Staked(msg.sender, amount);
        emit TotalStakedUpdated(totalStaked);
    }
    function requestUnstake() external nonReentrant whenNotPaused {
        ValidatorInfo storage v = validators[msg.sender];
        require(!v.isQuarantined, "Validator quarantined");
        require(v.stakedAmount > 0, "Nothing staked");
        require(block.timestamp >= v.unlockTime, "Stake still locked");
        require(v.unstakeRequestedAt == 0, "Already requested");
        v.unstakeRequestedAt = block.timestamp;
        v.isActive = false;
        emit UnstakeRequested(msg.sender, block.timestamp + UNBONDING_PERIOD);
    }
    function withdraw(uint256 amount) external nonReentrant {
        ValidatorInfo storage v = validators[msg.sender];
        require(!v.isQuarantined, "Validator quarantined");
        require(v.unstakeRequestedAt != 0, "Request unstake first");
        require(block.timestamp >= v.unstakeRequestedAt + UNBONDING_PERIOD, "Cooldown not finished");
        require(amount > 0 && amount <= v.stakedAmount, "Invalid amount");
        v.stakedAmount -= amount;
        totalStaked -= amount;
        v.isActive = false;
        if (v.stakedAmount == 0) v.unstakeRequestedAt = 0;
        else v.unstakeRequestedAt = block.timestamp;
        echoToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
        emit TotalStakedUpdated(totalStaked);
    }
    function fundRewards(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Invalid amount");
        uint256 beforeBalance = echoToken.balanceOf(address(this));
        echoToken.safeTransferFrom(msg.sender, address(this), amount);
        require(echoToken.balanceOf(address(this)) - beforeBalance == amount, "Transfer amount mismatch");
        rewardPool += amount;
        emit RewardFunded(msg.sender, amount);
        emit RewardPoolUpdated(rewardPool);
    }
    function distributeReward(address validator, uint256 amount) external onlyOwner nonReentrant whenNotPaused {
        require(validator != address(0), "Invalid validator");
        ValidatorInfo storage v = validators[validator];
        require(v.isActive, "Validator inactive");
        require(!v.isQuarantined, "Validator quarantined");
        require(v.stakedAmount >= MIN_STAKE, "Insufficient collateral");
        require(amount > 0 && amount <= rewardPool, "Insufficient rewards");
        rewardPool -= amount;
        echoToken.safeTransfer(validator, amount);
        emit RewardDistributed(validator, amount);
        emit RewardPoolUpdated(rewardPool);
    }
    function slashNode(address validator, uint256 driftMs, bytes32 incidentId) external onlyForensicAuthority whenNotPaused {
        require(driftMs > MAX_CLOCK_DRIFT_MS, "Drift within threshold");
        _slash(validator, incidentId);
    }
    function slash(address validator, bytes32 incidentId) external onlyForensicAuthority whenNotPaused {
        _slash(validator, incidentId);
    }
    function _slash(address validator, bytes32 incidentId) internal {
        require(validator != address(0), "Invalid validator");
        require(incidentId != bytes32(0), "Invalid incident");
        require(!processedIncidents[incidentId], "Incident already processed");
        ValidatorInfo storage v = validators[validator];
        require(v.stakedAmount > 0, "No stake");
        require(!v.isQuarantined, "Already quarantined");
        if (v.lastSlashedAt != 0) require(block.timestamp >= v.lastSlashedAt + SLASH_COOLDOWN, "Slashing cooldown active");
        processedIncidents[incidentId] = true;
        uint256 penalty = v.stakedAmount < SLASHING_PENALTY ? v.stakedAmount : SLASHING_PENALTY;
        v.stakedAmount -= penalty;
        totalStaked -= penalty;
        rewardPool += penalty;
        v.lastSlashedAt = block.timestamp;
        v.isActive = false;
        v.isQuarantined = true;
        emit Slashed(validator, penalty, incidentId);
        emit NodeQuarantined(validator);
        emit TotalStakedUpdated(totalStaked);
        emit RewardPoolUpdated(rewardPool);
    }
    function reactivateValidator(address validator) external onlyOwner whenNotPaused {
        require(validator != address(0), "Invalid validator");
        ValidatorInfo storage v = validators[validator];
        require(v.isQuarantined, "Not quarantined");
        v.isQuarantined = false;
        if (v.unstakeRequestedAt == 0) {
            if (v.unlockTime < block.timestamp) v.unlockTime = block.timestamp + LOCK_PERIOD;
            v.isActive = v.stakedAmount >= MIN_STAKE;
        } else v.isActive = false;
        emit ValidatorReactivated(validator);
    }
    function rescueExcessTokens(address tokenAddress, address recipient, uint256 amount) external onlyOwner nonReentrant {
        require(tokenAddress != address(0), "Invalid token");
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        IERC20 token = IERC20(tokenAddress);
        if (tokenAddress == address(echoToken)) {
            uint256 reserved = totalStaked + rewardPool;
            uint256 balance = echoToken.balanceOf(address(this));
            require(balance >= reserved, "Insufficient backing");
            require(amount <= balance - reserved, "Reserved ECHO cannot be rescued");
        }
        token.safeTransfer(recipient, amount);
        emit ExcessTokenRescued(tokenAddress, recipient, amount);
    }
    function isValidatorActive(address validator) external view returns (bool) {
        ValidatorInfo memory v = validators[validator];
        return !paused() && v.isActive && !v.isQuarantined && v.unstakeRequestedAt == 0 && v.stakedAmount >= MIN_STAKE;
    }
    function isNodeQuarantined(address validator) external view returns (bool) { return validators[validator].isQuarantined; }
    function getValidatorStake(address validator) external view returns (uint256) { return validators[validator].stakedAmount; }
    function getUnstakeAvailableAt(address validator) external view returns (uint256) {
        uint256 t = validators[validator].unstakeRequestedAt;
        return t == 0 ? 0 : t + UNBONDING_PERIOD;
    }
    function minimumStake() external pure returns (uint256) { return MIN_STAKE; }
    function slashingPenalty() external pure returns (uint256) { return SLASHING_PENALTY; }
    function maxClockDriftMs() external pure returns (uint256) { return MAX_CLOCK_DRIFT_MS; }
    function availableExcessEcho() external view returns (uint256) {
        uint256 balance = echoToken.balanceOf(address(this));
        uint256 reserved = totalStaked + rewardPool;
        return balance <= reserved ? 0 : balance - reserved;
    }
}
