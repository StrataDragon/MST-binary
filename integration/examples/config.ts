/** Loads addresses + ABIs produced by `npm run deploy:*` (integration/machinapay.contracts.json). */
import * as fs from "fs";
import * as path from "path";
import { Contract, JsonRpcProvider, Provider, Signer } from "ethers";

export const cfg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "machinapay.contracts.json"), "utf8")
) as {
  network: string; chainId: number; rpcUrl: string; explorerUrl: string | null; nativeToken: string;
  addresses: { MachineRegistry: string; JobEscrow: string };
  verifier: string;
  eip712: { name: string; version: string; chainId: number; verifyingContract: string };
  abi: { MachineRegistry: any[]; JobEscrow: any[] };
};

export const RPC_URL = process.env.RPC_URL || cfg.rpcUrl;
// cacheTimeout: -1 disables ethers v6 response caching. Without it, two quick transactions from the same wallet
// can reuse a cached nonce and fail with "nonce has already been used".
export const provider = new JsonRpcProvider(RPC_URL, cfg.chainId, { cacheTimeout: -1, staticNetwork: true });

export const getRegistry = (runner: Provider | Signer = provider) =>
  new Contract(cfg.addresses.MachineRegistry, cfg.abi.MachineRegistry, runner);
export const getEscrow = (runner: Provider | Signer = provider) =>
  new Contract(cfg.addresses.JobEscrow, cfg.abi.JobEscrow, runner);
