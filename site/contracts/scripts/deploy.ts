import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const factory = await ethers.getContractFactory("AmbrContractNFT");
  const contract = await factory.deploy(deployer.address);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("AmbrContractNFT deployed to:", address);
  console.log("Set CNFT_CONTRACT_ADDRESS=" + address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
