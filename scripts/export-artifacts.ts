import * as fs from "fs";
import * as path from "path";

interface ContractExport {
  abi: any[];
  networks: {
    [chainId: string]: {
      address: string;
      transactionHash?: string;
      blockNumber?: number;
    };
  };
}

async function main() {
  const artifactsPath = path.join(__dirname, "../artifacts/contracts/StopFeedingTheCat.sol/StopFeedingTheCat.json");
  const deploymentsPath = path.join(__dirname, "../deployments/deployments.json");
  const exportPath = path.join(__dirname, "../dist");

  if (!fs.existsSync(artifactsPath)) {
    console.error("Contract artifacts not found. Please compile first.");
    process.exit(1);
  }

  if (!fs.existsSync(deploymentsPath)) {
    console.error("Deployments not found. Please deploy first.");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

  const contractExport: ContractExport = {
    abi: artifact.abi,
    networks: {},
  };

  for (const [networkName, deployment] of Object.entries(deployments)) {
    const networkDeployment = deployment as any;
    if (networkDeployment.StopFeedingTheCat) {
      const chainId = networkDeployment.StopFeedingTheCat.chainId.toString();
      contractExport.networks[chainId] = {
        address: networkDeployment.StopFeedingTheCat.address,
        transactionHash: networkDeployment.StopFeedingTheCat.transactionHash,
        blockNumber: networkDeployment.StopFeedingTheCat.blockNumber,
      };
    }
  }

  fs.mkdirSync(exportPath, { recursive: true });

  const indexContent = `export const StopFeedingTheCat = ${JSON.stringify(contractExport, null, 2)};

export const MockUSDC = {
  abi: ${JSON.stringify(JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/mocks/MockUSDC.sol/MockUSDC.json"), "utf8")).abi, null, 2)},
  networks: {}
};
`;

  fs.writeFileSync(path.join(exportPath, "index.js"), indexContent);

  const dtsContent = `export interface Network {
  address: string;
  transactionHash?: string;
  blockNumber?: number;
}

export interface ContractExport {
  abi: any[];
  networks: {
    [chainId: string]: Network;
  };
}

export declare const StopFeedingTheCat: ContractExport;
export declare const MockUSDC: ContractExport;
`;

  fs.writeFileSync(path.join(exportPath, "index.d.ts"), dtsContent);

  console.log("Artifacts exported successfully to dist/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});