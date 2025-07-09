import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const deploymentsPath = path.join(__dirname, "../deployments/deployments.json");
  
  if (!fs.existsSync(deploymentsPath)) {
    console.error("No deployments found. Please deploy first.");
    process.exit(1);
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const networkName = network.name;
  
  if (!deployments[networkName]) {
    console.error(`No deployment found for network: ${networkName}`);
    process.exit(1);
  }

  const deployment = deployments[networkName].StopFeedingTheCat;
  
  if (!deployment || !deployment.implementationAddress) {
    console.error("StopFeedingTheCat deployment not found");
    process.exit(1);
  }

  console.log(`Verifying implementation contract on ${networkName}...`);
  console.log("Implementation address:", deployment.implementationAddress);

  try {
    await run("verify:verify", {
      address: deployment.implementationAddress,
      constructorArguments: [],
    });
    console.log("Verification successful!");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("Contract is already verified!");
    } else {
      console.error("Verification failed:", error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});