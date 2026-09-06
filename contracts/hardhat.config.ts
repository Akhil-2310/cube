import "dotenv/config";
import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import type { HardhatUserConfig } from "hardhat/config";
import "solidity-coverage";

import "./tasks/accounts";

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY ?? "";
const INFURA_API_KEY = process.env.INFURA_API_KEY ?? "";
const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  (ALCHEMY_API_KEY
    ? `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
    : `https://sepolia.infura.io/v3/${INFURA_API_KEY}`);
const LOCAL_TEST_MNEMONIC = "test test test test test test test test test test test junk";

function normalizedPrivateKey(value: string): string | undefined {
  if (!value) return undefined;
  const privateKey = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("DEPLOYER_PRIVATE_KEY must be a 32-byte hexadecimal private key");
  }
  return privateKey;
}

const DEPLOYER_PRIVATE_KEY = normalizedPrivateKey(process.env.DEPLOYER_PRIVATE_KEY ?? "");

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: 0,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY ?? "",
  },
  sourcify: {
    enabled: false,
  },
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    anvil: {
      accounts: {
        mnemonic: LOCAL_TEST_MNEMONIC,
        path: "m/44'/60'/0'/0/",
        count: 10,
      },
      chainId: 31337,
      url: "http://localhost:8545",
    },
    sepolia: {
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 11155111,
      url: SEPOLIA_RPC_URL,
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.27",
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/hardhat-template/issues/31
        bytecodeHash: "none",
      },
      // Disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 800,
      },
      evmVersion: "cancun",
    },
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
};

export default config;
