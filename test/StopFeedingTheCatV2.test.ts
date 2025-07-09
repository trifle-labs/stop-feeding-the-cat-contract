import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { StopFeedingTheCat, StopFeedingTheCatV2, MockUSDC } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("StopFeedingTheCatV2 Upgrade", function () {
  let stopFeedingTheCat: StopFeedingTheCat;
  let stopFeedingTheCatV2: StopFeedingTheCatV2;
  let mockUSDC: MockUSDC;
  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let proxyAddress: string;

  const ADMIN_FEE_PERCENTAGE = 10;
  const BASE_URI = "https://api.stopfeedingthecatgame.com/metadata/";
  const ONE_DAY = 24 * 3600;

  beforeEach(async function () {
    [owner, admin, user1, user2] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();

    await mockUSDC.mint(user1.address, ethers.parseUnits("10000", 6));
    await mockUSDC.mint(user2.address, ethers.parseUnits("10000", 6));

    // Deploy V1
    const StopFeedingTheCat = await ethers.getContractFactory("StopFeedingTheCat");
    stopFeedingTheCat = await upgrades.deployProxy(
      StopFeedingTheCat,
      [await mockUSDC.getAddress(), admin.address, ADMIN_FEE_PERCENTAGE, BASE_URI],
      { initializer: "initialize" }
    ) as unknown as StopFeedingTheCat;
    await stopFeedingTheCat.waitForDeployment();
    
    proxyAddress = await stopFeedingTheCat.getAddress();

    // Set up approvals
    await mockUSDC.connect(user1).approve(proxyAddress, ethers.MaxUint256);
    await mockUSDC.connect(user2).approve(proxyAddress, ethers.MaxUint256);
  });

  describe("Upgrade Process", function () {
    it("Should upgrade to V2 successfully", async function () {
      // Play some rounds in V1
      await stopFeedingTheCat.connect(user1).feedTheCat(1);
      await stopFeedingTheCat.connect(user2).feedTheCat(2);
      
      const preUpgradeRounds = await stopFeedingTheCat.totalRounds();
      const preUpgradeRoundInfo = await stopFeedingTheCat.getCurrentRoundInfo();

      // Upgrade to V2
      const StopFeedingTheCatV2 = await ethers.getContractFactory("StopFeedingTheCatV2");
      stopFeedingTheCatV2 = await upgrades.upgradeProxy(
        proxyAddress,
        StopFeedingTheCatV2,
        {
          call: {
            fn: "initializeV2",
            args: []
          }
        }
      ) as unknown as StopFeedingTheCatV2;

      // Verify upgrade
      expect(await stopFeedingTheCatV2.getVersion()).to.equal(2);
      expect(await stopFeedingTheCatV2.totalRounds()).to.equal(preUpgradeRounds);
      expect(await stopFeedingTheCatV2.emergencyPaused()).to.be.false;
      
      // Verify state preservation
      const postUpgradeRoundInfo = await stopFeedingTheCatV2.getCurrentRoundInfo();
      expect(postUpgradeRoundInfo.poolAmount).to.equal(preUpgradeRoundInfo.poolAmount);
      expect(postUpgradeRoundInfo.lastFeeder).to.equal(preUpgradeRoundInfo.lastFeeder);
      expect(postUpgradeRoundInfo.roundNumber).to.equal(preUpgradeRoundInfo.roundNumber);
    });

    it("Should preserve state after upgrade during active round", async function () {
      // Start a round and feed some items
      await stopFeedingTheCat.connect(user1).feedTheCat(5); // $5 item
      await stopFeedingTheCat.connect(user2).feedTheCat(3); // $3 item
      
      const roundInfoBefore = await stopFeedingTheCat.getCurrentRoundInfo();
      const timeRemainingBefore = await stopFeedingTheCat.getTimeRemaining();
      
      // Upgrade during active round
      const StopFeedingTheCatV2 = await ethers.getContractFactory("StopFeedingTheCatV2");
      stopFeedingTheCatV2 = await upgrades.upgradeProxy(
        proxyAddress,
        StopFeedingTheCatV2,
        {
          call: {
            fn: "initializeV2",
            args: []
          }
        }
      ) as unknown as StopFeedingTheCatV2;

      // Verify round continues exactly as before
      const roundInfoAfter = await stopFeedingTheCatV2.getCurrentRoundInfo();
      const timeRemainingAfter = await stopFeedingTheCatV2.getTimeRemaining();
      
      expect(roundInfoAfter.poolAmount).to.equal(roundInfoBefore.poolAmount);
      expect(roundInfoAfter.lastFeeder).to.equal(roundInfoBefore.lastFeeder);
      expect(roundInfoAfter.isActive).to.equal(roundInfoBefore.isActive);
      expect(timeRemainingAfter).to.be.closeTo(timeRemainingBefore, 5); // Allow 5 second difference
      
      // Round should continue to work normally
      await stopFeedingTheCatV2.connect(user1).feedTheCat(1);
      const finalRoundInfo = await stopFeedingTheCatV2.getCurrentRoundInfo();
      expect(finalRoundInfo.lastFeeder).to.equal(user1.address);
    });
  });

  describe("Emergency Pause Feature", function () {
    beforeEach(async function () {
      // Upgrade to V2
      const StopFeedingTheCatV2 = await ethers.getContractFactory("StopFeedingTheCatV2");
      stopFeedingTheCatV2 = await upgrades.upgradeProxy(
        proxyAddress,
        StopFeedingTheCatV2,
        {
          call: {
            fn: "initializeV2",
            args: []
          }
        }
      ) as unknown as StopFeedingTheCatV2;
    });

    it("Should allow owner to toggle emergency pause", async function () {
      expect(await stopFeedingTheCatV2.emergencyPaused()).to.be.false;
      
      await expect(stopFeedingTheCatV2.toggleEmergencyPause())
        .to.emit(stopFeedingTheCatV2, "EmergencyPauseToggled")
        .withArgs(true);
      
      expect(await stopFeedingTheCatV2.emergencyPaused()).to.be.true;
      
      await expect(stopFeedingTheCatV2.toggleEmergencyPause())
        .to.emit(stopFeedingTheCatV2, "EmergencyPauseToggled")
        .withArgs(false);
      
      expect(await stopFeedingTheCatV2.emergencyPaused()).to.be.false;
    });

    it("Should prevent feeding when emergency paused", async function () {
      // Normal feeding should work
      await stopFeedingTheCatV2.connect(user1).feedTheCat(1);
      
      // Enable emergency pause
      await stopFeedingTheCatV2.toggleEmergencyPause();
      
      // Feeding should be blocked
      await expect(stopFeedingTheCatV2.connect(user1).feedTheCat(2))
        .to.be.revertedWith("Contract is emergency paused");
      
      // Disable emergency pause
      await stopFeedingTheCatV2.toggleEmergencyPause();
      
      // Feeding should work again
      await stopFeedingTheCatV2.connect(user1).feedTheCat(2);
    });

    it("Should prevent ending rounds when emergency paused", async function () {
      // Start a round
      await stopFeedingTheCatV2.connect(user1).feedTheCat(1);
      
      // Wait for timer to expire
      await time.increase(ONE_DAY + 1);
      
      // Emergency pause
      await stopFeedingTheCatV2.toggleEmergencyPause();
      
      // Should not be able to end round
      await expect(stopFeedingTheCatV2.checkAndEndRound())
        .to.be.revertedWith("Contract is emergency paused");
      
      // Disable emergency pause
      await stopFeedingTheCatV2.toggleEmergencyPause();
      
      // Should be able to end round now
      await stopFeedingTheCatV2.checkAndEndRound();
    });

    it("Should work independently of regular pause", async function () {
      // Regular pause should still work
      await stopFeedingTheCatV2.pause();
      
      await expect(stopFeedingTheCatV2.connect(user1).feedTheCat(1))
        .to.be.revertedWithCustomError(stopFeedingTheCatV2, "EnforcedPause");
      
      // Emergency pause can still be toggled when regularly paused
      await stopFeedingTheCatV2.toggleEmergencyPause();
      expect(await stopFeedingTheCatV2.emergencyPaused()).to.be.true;
      
      await stopFeedingTheCatV2.unpause();
      
      // Should still be emergency paused even after unpausing
      await expect(stopFeedingTheCatV2.connect(user1).feedTheCat(1))
        .to.be.revertedWith("Contract is emergency paused");
      
      // Both operational status functions should work
      expect(await stopFeedingTheCatV2.isOperationallyPaused()).to.be.true;
      
      await stopFeedingTheCatV2.toggleEmergencyPause();
      expect(await stopFeedingTheCatV2.isOperationallyPaused()).to.be.false;
    });

    it("Should only allow owner to toggle emergency pause", async function () {
      await expect(stopFeedingTheCatV2.connect(user1).toggleEmergencyPause())
        .to.be.revertedWithCustomError(stopFeedingTheCatV2, "OwnableUnauthorizedAccount");
    });

    it("Should return correct operational pause status", async function () {
      // Initially not paused
      expect(await stopFeedingTheCatV2.isOperationallyPaused()).to.be.false;
      
      // Emergency pause
      await stopFeedingTheCatV2.toggleEmergencyPause();
      expect(await stopFeedingTheCatV2.isOperationallyPaused()).to.be.true;
      
      // Regular pause while emergency paused
      await stopFeedingTheCatV2.pause();
      expect(await stopFeedingTheCatV2.isOperationallyPaused()).to.be.true;
      
      // Turn off emergency pause, should still be paused
      await stopFeedingTheCatV2.toggleEmergencyPause();
      expect(await stopFeedingTheCatV2.isOperationallyPaused()).to.be.true;
      
      // Turn off regular pause
      await stopFeedingTheCatV2.unpause();
      expect(await stopFeedingTheCatV2.isOperationallyPaused()).to.be.false;
    });

    it("Should handle multiple emergency pause toggles", async function () {
      // Toggle multiple times
      await stopFeedingTheCatV2.toggleEmergencyPause();
      expect(await stopFeedingTheCatV2.emergencyPaused()).to.be.true;
      
      await stopFeedingTheCatV2.toggleEmergencyPause();
      expect(await stopFeedingTheCatV2.emergencyPaused()).to.be.false;
      
      await stopFeedingTheCatV2.toggleEmergencyPause();
      expect(await stopFeedingTheCatV2.emergencyPaused()).to.be.true;
    });
  });
});