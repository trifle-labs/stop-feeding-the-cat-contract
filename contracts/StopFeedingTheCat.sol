// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract StopFeedingTheCat is 
    Initializable,
    ERC1155Upgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    uint256 public constant TOTAL_ITEMS = 13;
    uint256 public constant BASE_TIMER_HOURS = 24;
    uint256 public constant MAX_TIMER_REDUCTION_HOURS = 23;
    
    IERC20 public usdcToken;
    address public adminWallet;
    uint256 public adminFeePercentage;
    string public baseTokenURI;

    struct GameRound {
        uint256 poolAmount;
        address lastFeeder;
        uint256 timerEndTime;
        bool isActive;
        uint256 roundNumber;
    }

    GameRound public currentRound;
    uint256 public totalRounds;

    mapping(uint256 => uint256) public itemPrices;
    mapping(uint256 => uint256) public timerReductions;
    mapping(address => mapping(uint256 => uint256)) public userItemsFed;

    event ItemFed(
        address indexed feeder,
        uint256 indexed itemId,
        uint256 roundNumber,
        uint256 newTimerEndTime
    );
    event RoundEnded(
        uint256 indexed roundNumber,
        address indexed winner,
        uint256 prizeAmount
    );
    event NewRoundStarted(uint256 indexed roundNumber);
    event AdminFeeUpdated(uint256 newPercentage);
    event AdminWalletUpdated(address newWallet);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _usdcToken,
        address _adminWallet,
        uint256 _adminFeePercentage,
        string memory _baseTokenURI
    ) public initializer {
        __ERC1155_init(_baseTokenURI);
        __Ownable_init(msg.sender);
        __Pausable_init();
        __UUPSUpgradeable_init();

        require(_usdcToken != address(0), "Invalid USDC address");
        require(_adminWallet != address(0), "Invalid admin wallet");
        require(_adminFeePercentage <= 100, "Fee percentage too high");

        usdcToken = IERC20(_usdcToken);
        adminWallet = _adminWallet;
        adminFeePercentage = _adminFeePercentage;
        baseTokenURI = _baseTokenURI;

        for (uint256 i = 1; i <= TOTAL_ITEMS; i++) {
            itemPrices[i] = i * 1e6;
            timerReductions[i] = i;
        }

        _startNewRound();
    }

    function feedTheCat(uint256 itemId) external virtual whenNotPaused {
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

    function checkAndEndRound() external virtual {
        require(currentRound.isActive, "No active round");
        require(
            currentRound.timerEndTime > 0 && block.timestamp >= currentRound.timerEndTime,
            "Timer not expired"
        );
        _endRound();
    }

    function _endRound() internal virtual {
        require(currentRound.isActive, "Round already ended");
        
        currentRound.isActive = false;
        
        uint256 prizeAmount = currentRound.poolAmount;
        address winner = currentRound.lastFeeder;
        
        if (prizeAmount > 0 && winner != address(0)) {
            usdcToken.safeTransfer(winner, prizeAmount);
        }
        
        emit RoundEnded(currentRound.roundNumber, winner, prizeAmount);
        
        _startNewRound();
    }

    function _startNewRound() internal {
        totalRounds++;
        currentRound = GameRound({
            poolAmount: 0,
            lastFeeder: address(0),
            timerEndTime: 0,
            isActive: true,
            roundNumber: totalRounds
        });
        
        emit NewRoundStarted(totalRounds);
    }

    function setItemPrice(uint256 itemId, uint256 price) external onlyOwner {
        require(itemId >= 1 && itemId <= TOTAL_ITEMS, "Invalid item ID");
        itemPrices[itemId] = price;
    }

    function setTimerReduction(uint256 itemId, uint256 hoursToReduce) external onlyOwner {
        require(itemId >= 1 && itemId <= TOTAL_ITEMS, "Invalid item ID");
        require(hoursToReduce <= MAX_TIMER_REDUCTION_HOURS, "Reduction too high");
        timerReductions[itemId] = hoursToReduce;
    }

    function setAdminFeePercentage(uint256 _percentage) external onlyOwner {
        require(_percentage <= 100, "Fee percentage too high");
        adminFeePercentage = _percentage;
        emit AdminFeeUpdated(_percentage);
    }

    function setAdminWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "Invalid wallet address");
        adminWallet = _wallet;
        emit AdminWalletUpdated(_wallet);
    }

    function setBaseURI(string memory _baseURI) external onlyOwner {
        baseTokenURI = _baseURI;
        _setURI(_baseURI);
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        return string(abi.encodePacked(baseTokenURI, uint2str(tokenId)));
    }

    function uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function getTimeRemaining() external view returns (uint256) {
        if (!currentRound.isActive || currentRound.timerEndTime == 0) {
            return 0;
        }
        if (block.timestamp >= currentRound.timerEndTime) {
            return 0;
        }
        return currentRound.timerEndTime - block.timestamp;
    }

    function getCurrentRoundInfo() external view returns (
        uint256 poolAmount,
        address lastFeeder,
        uint256 timerEndTime,
        bool isActive,
        uint256 roundNumber
    ) {
        return (
            currentRound.poolAmount,
            currentRound.lastFeeder,
            currentRound.timerEndTime,
            currentRound.isActive,
            currentRound.roundNumber
        );
    }
}