// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "./StopFeedingTheCat.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract StopFeedingTheCatV2 is StopFeedingTheCat {
    using SafeERC20 for IERC20;
    uint256 public constant VERSION = 2;
    
    // Emergency pause functionality
    bool public emergencyPaused;
    
    event EmergencyPauseToggled(bool paused);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initializeV2() public reinitializer(2) {
        emergencyPaused = false;
    }
    
    // Override feedTheCat to check emergency pause
    function feedTheCat(uint256 itemId) external override whenNotPaused {
        require(!emergencyPaused, "Contract is emergency paused");
        require(itemId >= 1 && itemId <= TOTAL_ITEMS, "Invalid item ID");
        require(currentRound.isActive, "No active round");
        
        if (currentRound.timerEndTime > 0 && block.timestamp >= currentRound.timerEndTime) {
            _endRound();
            return;
        }

        uint256 price = itemPrices[itemId];
        usdcToken.safeTransferFrom(msg.sender, address(this), price);

        uint256 adminFee = (price * adminFeePercentage) / 100;
        uint256 poolContribution = price - adminFee;

        if (adminFee > 0) {
            usdcToken.safeTransfer(adminWallet, adminFee);
        }

        currentRound.poolAmount += poolContribution;

        _mint(msg.sender, itemId, 1, "");
        _burn(msg.sender, itemId, 1);

        uint256 currentReduction = 0;
        if (msg.sender == currentRound.lastFeeder) {
            currentReduction = timerReductions[itemId];
            if (currentReduction > MAX_TIMER_REDUCTION_HOURS) {
                currentReduction = MAX_TIMER_REDUCTION_HOURS;
            }
        }

        uint256 newTimer = (BASE_TIMER_HOURS - currentReduction) * 1 hours;
        currentRound.timerEndTime = block.timestamp + newTimer;
        currentRound.lastFeeder = msg.sender;

        userItemsFed[msg.sender][currentRound.roundNumber]++;

        emit ItemFed(msg.sender, itemId, currentRound.roundNumber, currentRound.timerEndTime);
    }
    
    // Override checkAndEndRound to respect emergency pause
    function checkAndEndRound() external override {
        require(!emergencyPaused, "Contract is emergency paused");
        require(currentRound.isActive, "No active round");
        require(
            currentRound.timerEndTime > 0 && block.timestamp >= currentRound.timerEndTime,
            "Timer not expired"
        );
        _endRound();
    }
    
    // Emergency pause function - can be called even when contract is paused
    function toggleEmergencyPause() external onlyOwner {
        emergencyPaused = !emergencyPaused;
        emit EmergencyPauseToggled(emergencyPaused);
    }
    
    // View function to get version
    function getVersion() external pure returns (uint256) {
        return VERSION;
    }
    
    // Check if contract is operationally paused (either regular pause or emergency pause)
    function isOperationallyPaused() external view returns (bool) {
        return paused() || emergencyPaused;
    }
    
    // Storage gap for future upgrades
    uint256[49] private __gap;
}