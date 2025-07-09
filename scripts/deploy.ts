import { ethers, upgrades, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeploymentInfo {
  address: string;
  implementationAddress?: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
  deployer: string;
  network: string;
  chainId: number;
}

interface Deployments {
  [network: string]: {
    StopFeedingTheCat: DeploymentInfo;
    MockUSDC?: DeploymentInfo;
  };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const networkName = network.name;
  const chainId = (await ethers.provider.getNetwork()).chainId;

  let usdcAddress: string;
  let adminWallet: string = process.env.ADMIN_WALLET || deployer.address;
  const adminFeePercentage = 10;
  const baseTokenURI = "https://api.stopfeedingthecatgame.com/metadata/";

  if (networkName === "hardhat" || networkName === "localhost") {
    console.log("Deploying MockUSDC for local testing...");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
    usdcAddress = await mockUSDC.getAddress();
    console.log("MockUSDC deployed to:", usdcAddress);

    const [, user1, user2] = await ethers.getSigners();
    await mockUSDC.mint(user1.address, ethers.parseUnits("10000", 6));
    await mockUSDC.mint(user2.address, ethers.parseUnits("10000", 6));
    console.log("Minted USDC to test accounts");
  } else if (networkName === "baseSepolia") {
    usdcAddress = process.env.USDC_ADDRESS_BASE_SEPOLIA || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  } else if (networkName === "base") {
    usdcAddress = process.env.USDC_ADDRESS_BASE_MAINNET || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  } else {
    throw new Error(`Unsupported network: ${networkName}`);
  }

  console.log("Deploying StopFeedingTheCat...");
  const StopFeedingTheCat = await ethers.getContractFactory("StopFeedingTheCat");
  const stopFeedingTheCat = await upgrades.deployProxy(
    StopFeedingTheCat,
    [usdcAddress, adminWallet, adminFeePercentage, baseTokenURI],
    { initializer: "initialize" }
  );

  await stopFeedingTheCat.waitForDeployment();
  const proxyAddress = await stopFeedingTheCat.getAddress();
  console.log("StopFeedingTheCat deployed to:", proxyAddress);

  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("Implementation deployed to:", implementationAddress);

  const deploymentInfo: DeploymentInfo = {
    address: proxyAddress,
    implementationAddress: implementationAddress,
    transactionHash: stopFeedingTheCat.deploymentTransaction()?.hash || "",
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: Date.now(),
    deployer: deployer.address,
    network: networkName,
    chainId: Number(chainId),
  };

  const deploymentsPath = path.join(__dirname, "../deployments/deployments.json");
  let deployments: Deployments = {};

  if (fs.existsSync(deploymentsPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  }

  if (!deployments[networkName]) {
    deployments[networkName] = {} as any;
  }

  deployments[networkName].StopFeedingTheCat = deploymentInfo;

  if (networkName === "hardhat" || networkName === "localhost") {
    deployments[networkName].MockUSDC = {
      address: usdcAddress,
      transactionHash: "",
      blockNumber: await ethers.provider.getBlockNumber(),
      timestamp: Date.now(),
      deployer: deployer.address,
      network: networkName,
      chainId: Number(chainId),
    };
  }

  fs.mkdirSync(path.dirname(deploymentsPath), { recursive: true });
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));

  console.log("\nDeployment complete!");
  console.log("Network:", networkName);
  console.log("StopFeedingTheCat:", proxyAddress);
  console.log("USDC:", usdcAddress);
  console.log("Admin Wallet:", adminWallet);
  console.log("Admin Fee:", adminFeePercentage + "%");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});