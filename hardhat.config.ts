import * as dotenv from "dotenv";
dotenv.config();

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

// ---- MST testnet settings (verified against MST-published repos, see README "MST network facts") ----
const MST_RPC_URL = process.env.MST_RPC_URL || "https://testnetrpc.mstblockchain.com";
const MST_CHAIN_ID = Number(process.env.MST_CHAIN_ID || 91562037);
const MST_PRIVATE_KEY = process.env.MST_PRIVATE_KEY || "";
const MST_GAS_PRICE_GWEI = process.env.MST_GAS_PRICE_GWEI; // optional manual override

// A private key must be 0x + 64 hex chars. Ignore placeholders so `hardhat test` never breaks.
const isValidKey = (k: string) => /^0x[0-9a-fA-F]{64}$/.test(k);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // "paris" = no PUSH0/MCOPY/transient opcodes -> deploys on any EVM chain, including
      // ones that have not activated Shanghai/Cancun. Change to "cancun" only if MST supports it.
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {},
    localhost: { url: process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545" },
    mst: {
      url: MST_RPC_URL,
      chainId: MST_CHAIN_ID,
      accounts: isValidKey(MST_PRIVATE_KEY) ? [MST_PRIVATE_KEY] : [],
      ...(MST_GAS_PRICE_GWEI
        ? { gasPrice: Math.round(Number(MST_GAS_PRICE_GWEI) * 1e9) }
        : {}),
      timeout: 120_000,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: { timeout: 120_000 },
};

export default config;
