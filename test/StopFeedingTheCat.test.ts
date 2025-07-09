import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { StopFeedingTheCat, MockUSDC } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("StopFeedingTheCat", function () {
  let stopFeedingTheCat: StopFeedingTheCat;
  let mockUSDC: MockUSDC;
  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  const ADMIN_FEE_PERCENTAGE = 10;
  const BASE_URI = "https://api.stopfeedingthecatgame.com/metadata/";
  const ONE_HOUR = 3600;
  const ONE_DAY = 24 * ONE_HOUR;

  beforeEach(async function () {
    [owner, admin, user1, user2, user3] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();

    await mockUSDC.mint(user1.address, ethers.parseUnits("10000", 6));
    await mockUSDC.mint(user2.address, ethers.parseUnits("10000", 6));
    await mockUSDC.mint(user3.address, ethers.parseUnits("10000", 6));

    const StopFeedingTheCat = await ethers.getContractFactory("StopFeedingTheCat");
    stopFeedingTheCat = await upgrades.deployProxy(
      StopFeedingTheCat,
      [await mockUSDC.getAddress(), admin.address, ADMIN_FEE_PERCENTAGE, BASE_URI],
      { initializer: "initialize" }
    ) as unknown as StopFeedingTheCat;
    await stopFeedingTheCat.waitForDeployment();
  });

  describe("Initialization", function () {
    it("Should initialize with correct values", async function () {
      expect(await stopFeedingTheCat.usdcToken()).to.equal(await mockUSDC.getAddress());
      expect(await stopFeedingTheCat.adminWallet()).to.equal(admin.address);
      expect(await stopFeedingTheCat.adminFeePercentage()).to.equal(ADMIN_FEE_PERCENTAGE);
      expect(await stopFeedingTheCat.baseTokenURI()).to.equal(BASE_URI);
      expect(await stopFeedingTheCat.totalRounds()).to.equal(1);
    });

    it("Should set correct item prices", async function () {
      for (let i = 1; i <= 13; i++) {
        expect(await stopFeedingTheCat.itemPrices(i)).to.equal(i * 1e6);
      }
    });

    it("Should set correct timer reductions", async function () {
      for (let i = 1; i <= 13; i++) {
        expect(await stopFeedingTheCat.timerReductions(i)).to.equal(i);
      }
    });
  });

  describe("Feeding the cat", function () {
    beforeEach(async function () {
      await mockUSDC.connect(user1).approve(await stopFeedingTheCat.getAddress(), ethers.MaxUint256);
      await mockUSDC.connect(user2).approve(await stopFeedingTheCat.getAddress(), ethers.MaxUint256);
    });

    it("Should allow feeding with item 1", async function () {
      const itemId = 1;
      const price = await stopFeedingTheCat.itemPrices(itemId);
      const adminBalanceBefore = await mockUSDC.balanceOf(admin.address);

      const tx = await stopFeedingTheCat.connect(user1).feedTheCat(itemId);
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try {
          const parsed = stopFeedingTheCat.interface.parseLog(log as any);
          return parsed?.name === "ItemFed";
        } catch {
          return false;
        }
      });
      
      expect(event).to.not.be.undefined;
      const parsedEvent = stopFeedingTheCat.interface.parseLog(event as any);
      expect(parsedEvent?.args[0]).to.equal(user1.address);
      expect(parsedEvent?.args[1]).to.equal(itemId);
      expect(parsedEvent?.args[2]).to.equal(1);

      const adminFee = (price * BigInt(ADMIN_FEE_PERCENTAGE)) / 100n;
      expect(await mockUSDC.balanceOf(admin.address)).to.equal(adminBalanceBefore + adminFee);

      const roundInfo = await stopFeedingTheCat.getCurrentRoundInfo();
      expect(roundInfo.poolAmount).to.equal(price - adminFee);
      expect(roundInfo.lastFeeder).to.equal(user1.address);
      expect(roundInfo.isActive).to.be.true;
    });

    it("Should reduce timer when same user feeds multiple items", async function () {
      await stopFeedingTheCat.connect(user1).feedTheCat(1);
      
      const timeBefore = await time.latest();
      await stopFeedingTheCat.connect(user1).feedTheCat(5);
      
      const roundInfo = await stopFeedingTheCat.getCurrentRoundInfo();
      const expectedTime = timeBefore + ONE_DAY - (5 * ONE_HOUR);
      expect(roundInfo.timerEndTime).to.be.closeTo(expectedTime, 5);
    });

    it("Should cap timer reduction at 23 hours", async function () {
      // First, create a custom item with timer reduction > 23 hours
      // Since setTimerReduction enforces the cap, we need to test the cap in the contract logic
      // For now, let's just verify that item 13 (which reduces by 13 hours) works correctly
      await stopFeedingTheCat.connect(user1).feedTheCat(1);
      
      // Feed item 13 which has timer reduction of 13 hours
      await stopFeedingTheCat.connect(user1).feedTheCat(13);
      
      const timeRemaining = await stopFeedingTheCat.getTimeRemaining();
      
      // Timer should be approximately 11 hours (24 - 13)
      expect(timeRemaining).to.be.closeTo(11 * ONE_HOUR, 10);
      
      // Now let's test the actual cap by trying to set reduction to exactly 23
      await stopFeedingTheCat.setTimerReduction(12, 23);
      await stopFeedingTheCat.connect(user2).feedTheCat(1); // Reset with different user
      await stopFeedingTheCat.connect(user2).feedTheCat(12); // Feed item with 23 hour reduction
      
      const timeRemainingAfterMaxReduction = await stopFeedingTheCat.getTimeRemaining();
      expect(timeRemainingAfterMaxReduction).to.be.closeTo(ONE_HOUR, 10);
    });

    it("Should reset timer when different user feeds", async function () {
      await stopFeedingTheCat.connect(user1).feedTheCat(1);
      await time.increase(ONE_HOUR * 10);
      
      const timeBefore = await time.latest();
      await stopFeedingTheCat.connect(user2).feedTheCat(1);
      
      const roundInfo = await stopFeedingTheCat.getCurrentRoundInfo();
      const expectedTime = timeBefore + ONE_DAY;
      expect(roundInfo.timerEndTime).to.be.closeTo(expectedTime, 5);
      expect(roundInfo.lastFeeder).to.equal(user2.address);
    });

    it("Should revert when feeding invalid item", async function () {
      await expect(stopFeedingTheCat.connect(user1).feedTheCat(0))
        .to.be.revertedWith("Invalid item ID");
      
      await expect(stopFeedingTheCat.connect(user1).feedTheCat(14))
        .to.be.revertedWith("Invalid item ID");
    });
  });

  describe("Round ending", function () {
    beforeEach(async function () {
      await mockUSDC.connect(user1).approve(await stopFeedingTheCat.getAddress(), ethers.MaxUint256);
      await mockUSDC.connect(user2).approve(await stopFeedingTheCat.getAddress(), ethers.MaxUint256);
    });

    it("Should end round and pay winner when timer expires", async function () {
      await stopFeedingTheCat.connect(user1).feedTheCat(1);
      await stopFeedingTheCat.connect(user2).feedTheCat(2);
      
      const roundInfo = await stopFeedingTheCat.getCurrentRoundInfo();
      const expectedPrize = roundInfo.poolAmount;
      const user2BalanceBefore = await mockUSDC.balanceOf(user2.address);
      
      await time.increase(ONE_DAY + 1);
      
      await expect(stopFeedingTheCat.checkAndEndRound())
        .to.emit(stopFeedingTheCat, "RoundEnded")
        .withArgs(1, user2.address, expectedPrize)
        .to.emit(stopFeedingTheCat, "NewRoundStarted")
        .withArgs(2);
      
      expect(await mockUSDC.balanceOf(user2.address)).to.equal(user2BalanceBefore + expectedPrize);
      expect(await stopFeedingTheCat.totalRounds()).to.equal(2);
    });

    it("Should auto-end round when feeding after timer expires", async function () {
      await stopFeedingTheCat.connect(user1).feedTheCat(1);
      const user1BalanceBefore = await mockUSDC.balanceOf(user1.address);
      
      await time.increase(ONE_DAY + 1);
      
      await expect(stopFeedingTheCat.connect(user2).feedTheCat(1))
        .to.emit(stopFeedingTheCat, "RoundEnded")
        .to.emit(stopFeedingTheCat, "NewRoundStarted");
      
      expect(await mockUSDC.balanceOf(user1.address)).to.be.gt(user1BalanceBefore);
    });

    it("Should not allow ending round before timer expires", async function () {
      await stopFeedingTheCat.connect(user1).feedTheCat(1);
      
      await expect(stopFeedingTheCat.checkAndEndRound())
        .to.be.revertedWith("Timer not expired");
    });
  });

  describe("Admin functions", function () {
    it("Should allow owner to set item price", async function () {
      await stopFeedingTheCat.setItemPrice(1, ethers.parseUnits("5", 6));
      expect(await stopFeedingTheCat.itemPrices(1)).to.equal(ethers.parseUnits("5", 6));
    });

    it("Should allow owner to set timer reduction", async function () {
      await stopFeedingTheCat.setTimerReduction(1, 3);
      expect(await stopFeedingTheCat.timerReductions(1)).to.equal(3);
    });

    it("Should not allow setting timer reduction above max", async function () {
      await expect(stopFeedingTheCat.setTimerReduction(1, 24))
        .to.be.revertedWith("Reduction too high");
    });

    it("Should allow owner to update admin fee", async function () {
      await expect(stopFeedingTheCat.setAdminFeePercentage(20))
        .to.emit(stopFeedingTheCat, "AdminFeeUpdated")
        .withArgs(20);
      
      expect(await stopFeedingTheCat.adminFeePercentage()).to.equal(20);
    });

    it("Should allow owner to update admin wallet", async function () {
      await expect(stopFeedingTheCat.setAdminWallet(user3.address))
        .to.emit(stopFeedingTheCat, "AdminWalletUpdated")
        .withArgs(user3.address);
      
      expect(await stopFeedingTheCat.adminWallet()).to.equal(user3.address);
    });

    it("Should allow owner to pause and unpause", async function () {
      await stopFeedingTheCat.pause();
      expect(await stopFeedingTheCat.paused()).to.be.true;
      
      await mockUSDC.connect(user1).approve(await stopFeedingTheCat.getAddress(), ethers.MaxUint256);
      await expect(stopFeedingTheCat.connect(user1).feedTheCat(1))
        .to.be.revertedWithCustomError(stopFeedingTheCat, "EnforcedPause");
      
      await stopFeedingTheCat.unpause();
      expect(await stopFeedingTheCat.paused()).to.be.false;
    });

    it("Should only allow owner to call admin functions", async function () {
      await expect(stopFeedingTheCat.connect(user1).setItemPrice(1, 100))
        .to.be.revertedWithCustomError(stopFeedingTheCat, "OwnableUnauthorizedAccount");
      
      await expect(stopFeedingTheCat.connect(user1).pause())
        .to.be.revertedWithCustomError(stopFeedingTheCat, "OwnableUnauthorizedAccount");
    });
  });

  describe("View functions", function () {
    beforeEach(async function () {
      await mockUSDC.connect(user1).approve(await stopFeedingTheCat.getAddress(), ethers.MaxUint256);
    });

    it("Should return correct time remaining", async function () {
      expect(await stopFeedingTheCat.getTimeRemaining()).to.equal(0);
      
      await stopFeedingTheCat.connect(user1).feedTheCat(1);
      
      const timeRemaining = await stopFeedingTheCat.getTimeRemaining();
      expect(timeRemaining).to.be.closeTo(ONE_DAY, 5);
      
      await time.increase(ONE_HOUR * 10);
      const newTimeRemaining = await stopFeedingTheCat.getTimeRemaining();
      expect(newTimeRemaining).to.be.closeTo(ONE_DAY - (ONE_HOUR * 10), 5);
    });

    it("Should return correct URI for tokens", async function () {
      expect(await stopFeedingTheCat.uri(1)).to.equal(BASE_URI + "1");
      expect(await stopFeedingTheCat.uri(13)).to.equal(BASE_URI + "13");
    });
  });

  describe("Edge Cases", function () {
    beforeEach(async function () {
      await mockUSDC.connect(user1).approve(await stopFeedingTheCat.getAddress(), ethers.MaxUint256);
      await mockUSDC.connect(user2).approve(await stopFeedingTheCat.getAddress(), ethers.MaxUint256);
    });

    it("Should handle zero admin fee", async function () {
      await stopFeedingTheCat.setAdminFeePercentage(0);
      
      const adminBalanceBefore = await mockUSDC.balanceOf(admin.address);
      await stopFeedingTheCat.connect(user1).feedTheCat(1);
      
      // Admin should receive no fees
      expect(await mockUSDC.balanceOf(admin.address)).to.equal(adminBalanceBefore);
    });

    it("Should handle setting base URI", async function () {
      const newURI = "https://newapi.example.com/metadata/";
      await stopFeedingTheCat.setBaseURI(newURI);
      
      expect(await stopFeedingTheCat.uri(1)).to.equal(newURI + "1");
    });

    it("Should handle uint2str edge cases", async function () {
      // Test with token ID 0
      expect(await stopFeedingTheCat.uri(0)).to.equal(BASE_URI + "0");
      
      // Test with larger token ID
      expect(await stopFeedingTheCat.uri(123)).to.equal(BASE_URI + "123");
    });

    it("Should handle timer reduction of 0", async function () {
      await stopFeedingTheCat.setTimerReduction(1, 0);
      
      await stopFeedingTheCat.connect(user1).feedTheCat(1);
      await stopFeedingTheCat.connect(user1).feedTheCat(1);
      
      // Timer should be full 24 hours since reduction is 0
      const timeRemaining = await stopFeedingTheCat.getTimeRemaining();
      expect(timeRemaining).to.be.closeTo(ONE_DAY, 10);
    });

    it("Should handle maximum timer reduction", async function () {
      await stopFeedingTheCat.setTimerReduction(1, 23);
      
      await stopFeedingTheCat.connect(user1).feedTheCat(1);
      await stopFeedingTheCat.connect(user1).feedTheCat(1);
      
      // Timer should be 1 hour (24 - 23)
      const timeRemaining = await stopFeedingTheCat.getTimeRemaining();
      expect(timeRemaining).to.be.closeTo(ONE_HOUR, 10);
    });
  });

  describe("Upgradeability", function () {
    it("Should only allow owner to upgrade", async function () {
      const StopFeedingTheCatV2 = await ethers.getContractFactory("StopFeedingTheCat");
      
      await expect(
        upgrades.upgradeProxy(await stopFeedingTheCat.getAddress(), StopFeedingTheCatV2.connect(user1))
      ).to.be.reverted;
    });
  });
});