import { ethers, upgrades, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const networkName = network.name;
  const version = process.env.UPGRADE_VERSION || process.argv[2];
  
  if (!version) {
    console.error("Please provide version number: npm run prepare-upgrade:local 2");
    process.exit(1);
  }

  console.log(`Preparing upgrade to version ${version} on ${networkName}...`);

  // Load deployment info
  const deploymentsPath = path.join(__dirname, "../deployments/deployments.json");
  
  if (!fs.existsSync(deploymentsPath)) {
    console.error("No deployments found. Please deploy first.");
    process.exit(1);
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  
  if (!deployments[networkName]) {
    console.error(`No deployment found for network: ${networkName}`);
    process.exit(1);
  }

  const deployment = deployments[networkName].StopFeedingTheCat;
  
  if (!deployment) {
    console.error("StopFeedingTheCat deployment not found");
    process.exit(1);
  }

  const proxyAddress = deployment.address;
  console.log("\n📊 Current Deployment Info:");
  console.log("Proxy address:", proxyAddress);
  console.log("Implementation:", deployment.implementationAddress);
  console.log("Deployed at:", new Date(deployment.timestamp).toLocaleString());
  console.log("Deployer:", deployment.deployer);

  // Get contract factory based on version
  const contractName = version === "2" ? "StopFeedingTheCatV2" : "StopFeedingTheCat";
  console.log(`\n🔍 Checking upgrade to ${contractName}...`);

  try {
    const NewContract = await ethers.getContractFactory(contractName);
    
    // Force compile and check storage layout
    console.log("\n📝 Compiling and checking storage layout...");
    await upgrades.validateUpgrade(proxyAddress, NewContract, {
      kind: "uups",
      unsafeSkipStorageCheck: false
    });
    
    console.log("✅ Storage layout is compatible");
    
    // Estimate upgrade gas cost
    console.log("\n⛽ Estimating upgrade gas cost...");
    const provider = ethers.provider;
    const deployTx = NewContract.getDeployTransaction();
    const estimatedGas = await provider.estimateGas({
      data: deployTx.data
    });
    
    console.log(`Estimated gas for implementation deployment: ${estimatedGas.toString()}`);
    
    const gasPrice = await provider.getFeeData();
    if (gasPrice.gasPrice) {
      const estimatedCost = estimatedGas * gasPrice.gasPrice;
      console.log(`Estimated cost: ${ethers.formatEther(estimatedCost)} ETH`);
    }
    
    // Check current contract state
    console.log("\n📊 Current Contract State:");
    const currentContract = await ethers.getContractAt("StopFeedingTheCat", proxyAddress);
    
    try {
      const owner = await currentContract.owner();
      console.log("Owner:", owner);
      
      const paused = await currentContract.paused();
      console.log("Paused:", paused);
      
      const roundInfo = await currentContract.getCurrentRoundInfo();
      console.log("\nCurrent Round:");
      console.log("- Number:", roundInfo.roundNumber.toString());
      console.log("- Active:", roundInfo.isActive);
      console.log("- Pool:", ethers.formatUnits(roundInfo.poolAmount, 6), "USDC");
      console.log("- Last feeder:", roundInfo.lastFeeder);
      
      if (roundInfo.timerEndTime > 0) {
        const now = Math.floor(Date.now() / 1000);
        const timeLeft = Number(roundInfo.timerEndTime) - now;
        if (timeLeft > 0) {
          console.log("- Time remaining:", Math.floor(timeLeft / 3600), "hours", Math.floor((timeLeft % 3600) / 60), "minutes");
        } else {
          console.log("- Timer expired! Round can be ended");
        }
      }
      
      const totalRounds = await currentContract.totalRounds();
      console.log("\nTotal rounds played:", totalRounds.toString());
      
    } catch (error) {
      console.log("Could not read all contract state");
    }
    
    // Show what's new in this version
    if (version === "2") {
      console.log("\n✨ New features in V2:");
      console.log("- Emergency pause functionality");
      console.log("- Independent of regular pause/unpause");
      console.log("- Blocks all game operations when active");
      console.log("- Can be toggled by contract owner");
    }
    
    console.log("\n✅ Upgrade preparation complete!");
    console.log("\nTo proceed with the upgrade, run:");
    console.log(`npm run upgrade:${networkName} ${version}`);
    
  } catch (error: any) {
    console.error("\n❌ Upgrade preparation failed!");
    console.error(error.message);
    
    if (error.message.includes("storage")) {
      console.error("\n⚠️  Storage layout incompatibility detected!");
      console.error("This could lead to corrupted state if you proceed.");
      console.error("Consider creating a new version with compatible storage layout.");
    }
    
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});