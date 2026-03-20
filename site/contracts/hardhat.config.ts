import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const DEPLOYER_KEY = process.env.CNFT_MINTER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: { evmVersion: "cancun" },
  },
  networks: {
    baseSepolia: {
      url: "https://sepolia.base.org",
      accounts: [DEPLOYER_KEY],
    },
    base: {
      url: "https://mainnet.base.org",
      accounts: [DEPLOYER_KEY],
    },
  },
};

export default config;
