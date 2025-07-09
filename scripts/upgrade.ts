import { ethers, upgrades, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { Contract } from "ethers";

interface UpgradeConfig {
  version: number;
  contractName: string;
  initializerFunction?: string;
  initializerArgs?: any[];
}

const UPGRADE_CONFIGS: { [version: number]: UpgradeConfig } = {
  2: {
    version: 2,
    contractName: "StopFeedingTheCatV2",
    initializerFunction: "initializeV2",
    initializerArgs: [] // No arguments needed for minimal V2
  },
  // Add future versions here:
  // 3: {
  //   version: 3,
  //   contractName: "StopFeedingTheCatV3",
  //   initializerFunction: "initializeV3",
  //   initializerArgs: [...]
  // }
};

async function validateUpgrade(
  proxyAddress: string,
  newContractName: string
): Promise<void> {
  console.log("Validating upgrade compatibility...");
  
  try {
    const NewContract = await ethers.getContractFactory(newContractName);
    await upgrades.validateUpgrade(proxyAddress, NewContract);
    console.log("✅ Upgrade validation passed");
  } catch (error) {
    console.error("❌ Upgrade validation failed:", error);
    throw error;
  }
}

async function performStorageLayoutCheck(
  proxyAddress: string,
  newContractName: string
): Promise<void> {
  console.log("Checking storage layout compatibility...");
  
  try {
    const NewContract = await ethers.getContractFactory(newContractName);
    await upgrades.validateUpgrade(proxyAddress, NewContract, {
      kind: "uups"
    });
    console.log("✅ Storage layout check passed");
  } catch (error) {
    console.error("❌ Storage layout incompatible:", error);
    throw error;
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading contracts with account:", deployer.address);

  const networkName = network.name;
  const version = process.env.UPGRADE_VERSION || process.argv[2];
  
  if (!version) {
    console.error("Please provide version number: npm run upgrade:local 2");
    process.exit(1);
  }

  const versionNum = parseInt(version);
  const upgradeConfig = UPGRADE_CONFIGS[versionNum];
  
  if (!upgradeConfig) {
    console.error(`No upgrade configuration found for version ${version}`);
    console.error("Available versions:", Object.keys(UPGRADE_CONFIGS).join(", "));
    process.exit(1);
  }

  console.log(`Upgrading to version ${versionNum}...`);
  console.log(`Contract name: ${upgradeConfig.contractName}`);

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
  console.log("Current proxy address:", proxyAddress);
  console.log("Current implementation:", deployment.implementationAddress);

  // Get current contract to check state
  const currentContract = await ethers.getContractAt("StopFeedingTheCat", proxyAddress);
  
  try {
    const roundInfo = await currentContract.getCurrentRoundInfo();
    console.log("\nCurrent contract state:");
    console.log("- Round number:", roundInfo.roundNumber.toString());
    console.log("- Pool amount:", ethers.formatUnits(roundInfo.poolAmount, 6), "USDC");
    console.log("- Is active:", roundInfo.isActive);
    
    if (roundInfo.isActive && roundInfo.poolAmount > 0) {
      console.warn("\n⚠️  WARNING: There is an active round with funds in the pool!");
      console.warn("Consider waiting for the round to end before upgrading.");
      
      // In production, you might want to require confirmation
      // const readline = require('readline').createInterface({
      //   input: process.stdin,
      //   output: process.stdout
      // });
      // const answer = await new Promise(resolve => {
      //   readline.question('Continue with upgrade? (yes/no): ', resolve);
      // });
      // if (answer !== 'yes') {
      //   console.log("Upgrade cancelled");
      //   process.exit(0);
      // }
    }
  } catch (error) {
    console.log("Could not read current contract state (might be first upgrade)");
  }

  // Perform validation checks
  await validateUpgrade(proxyAddress, upgradeConfig.contractName);
  await performStorageLayoutCheck(proxyAddress, upgradeConfig.contractName);

  console.log("\nProceeding with upgrade...");
  
  const NewContract = await ethers.getContractFactory(upgradeConfig.contractName);
  
  let upgradedContract: Contract;
  
  if (upgradeConfig.initializerFunction && upgradeConfig.initializerArgs) {
    console.log(`Calling ${upgradeConfig.initializerFunction} with args:`, upgradeConfig.initializerArgs);
    
    upgradedContract = await upgrades.upgradeProxy(
      proxyAddress,
      NewContract,
      {
        call: {
          fn: upgradeConfig.initializerFunction,
          args: upgradeConfig.initializerArgs
        }
      }
    );
  } else {
    upgradedContract = await upgrades.upgradeProxy(proxyAddress, NewContract);
  }

  await upgradedContract.waitForDeployment();
  
  const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("New implementation deployed to:", newImplementationAddress);

  // Verify the upgrade
  try {
    const upgradedContractV2 = await ethers.getContractAt(upgradeConfig.contractName, proxyAddress);
    const contractVersion = await upgradedContractV2.getVersion();
    console.log(`\n✅ Upgrade successful! Contract is now at version ${contractVersion}`);
    
    // Test new features based on version
    if (versionNum === 2) {
      const emergencyPaused = await upgradedContractV2.emergencyPaused();
      console.log("\nNew V2 features initialized:");
      console.log("- Emergency pause status:", emergencyPaused);
      console.log("- Emergency pause functionality available");
    }
  } catch (error) {
    console.error("Failed to verify upgrade:", error);
  }

  // Update deployment info
  deployment.implementationAddress = newImplementationAddress;
  deployment.version = versionNum;
  deployment.lastUpgrade = {
    timestamp: Date.now(),
    fromImplementation: deployment.implementationAddress,
    toImplementation: newImplementationAddress,
    version: versionNum
  };

  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  
  console.log("\n📝 Deployment info updated");
  console.log("Proxy address (unchanged):", proxyAddress);
  console.log("New implementation:", newImplementationAddress);
  console.log("Version:", versionNum);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});