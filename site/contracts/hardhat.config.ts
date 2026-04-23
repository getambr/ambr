import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const DEPLOYER_KEY = process.env.CNFT_MINTER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";
// Etherscan API V2 uses a single key across all supported chains (Base, Base Sepolia, Ethereum, etc.).
// Accept either var name for backward compatibility with older .env files.
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || process.env.BASESCAN_API_KEY || "";

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
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};

export default config;
