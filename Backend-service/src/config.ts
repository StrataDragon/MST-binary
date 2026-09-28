/**
 * Loads addresses + ABIs produced by Member 1's `npm run deploy:*`
 * (copied here as integration/machinapay.contracts.json). When they redeploy
 * (e.g. moving from localhost to MST testnet), replace that file with their
 * fresh copy — nothing else in this project needs to change.
 */
import * as fs from "fs";
import * as path from "path";
import { Contract, JsonRpcProvider, Provider, Signer } from "ethers";

const contractsPath =
  process.env.CONTRACTS_JSON || path.join(__dirname, "..", "integration", "machinapay.contracts.json");

export const cfg = JSON.parse(fs.readFileSync(contractsPath, "utf8")) as {
  network: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string | null;
  nativeToken: string;
  addresses: { MachineRegistry: string; JobEscrow: string };
  verifier: string;
  eip712: { name: string; version: string; chainId: number; verifyingContract: string };
  abi: { MachineRegistry: any[]; JobEscrow: any[] };
};

export const RPC_URL = process.env.RPC_URL || cfg.rpcUrl;

// cacheTimeout: -1 disables ethers v6 response caching. Without it, two quick
// transactions from the same wallet (e.g. acceptJob then startExecution) can
// reuse a cached nonce and fail with "nonce has already been used".
export const provider = new JsonRpcProvider(RPC_URL, cfg.chainId, {
  cacheTimeout: -1,
  staticNetwork: true,
});
provider.on("error", (err) => {
  // Gracefully handle periodic RPC filter reconnection glitches
});

export const getRegistry = (runner: Provider | Signer = provider) =>
  new Contract(cfg.addresses.MachineRegistry, cfg.abi.MachineRegistry, runner);

export const getEscrow = (runner: Provider | Signer = provider) =>
  new Contract(cfg.addresses.JobEscrow, cfg.abi.JobEscrow, runner);
