import React, { createContext, useContext, useState, useEffect } from "react";
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  parseEther,
  formatEther,
  isAddress,
  Signer,
  TransactionResponse,
} from "ethers";
import { cfg } from "./config";

export class WalletError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

const hexChainId = "0x" + cfg.chainId.toString(16);

/** Read-only provider — works without MetaMask, for dashboards / polling. */
export function getReadProvider() {
  return new JsonRpcProvider(cfg.rpcUrl, cfg.chainId, {
    cacheTimeout: -1,
    staticNetwork: true,
  });
}

/** Connects MetaMask and makes sure it's on the right chain, adding it if needed. */
export async function connectWallet(): Promise<{ provider: BrowserProvider; address: string; signer: Signer }> {
  const eth = (window as any).ethereum;
  if (!eth) throw new WalletError("NO_PROVIDER", "No Web3 wallet found. Please install MetaMask or another Ethereum wallet.");

  await eth.request({ method: "eth_requestAccounts" });

  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] });
  } catch (switchErr: any) {
    if (switchErr?.code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexChainId,
            chainName: cfg.network,
            rpcUrls: [cfg.rpcUrl],
            nativeCurrency: { name: cfg.nativeToken, symbol: cfg.nativeToken, decimals: 18 },
            blockExplorerUrls: cfg.explorerUrl ? [cfg.explorerUrl] : [],
          },
        ],
      });
    } else {
      throw switchErr;
    }
  }

  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, address, signer };
}

/** Raw ETH / native coin transfer function with format validation and error wrapping */
export async function sendEth(
  signer: Signer,
  to: string,
  amountEth: string,
  overrides: Record<string, any> = {}
): Promise<TransactionResponse> {
  if (!to || !isAddress(to)) {
    throw new WalletError("INVALID_ADDRESS", "Invalid recipient address format: must be 42-character hex");
  }

  try {
    const tx = await signer.sendTransaction({
      to,
      value: parseEther(amountEth),
      ...overrides,
    });
    return tx; // Caller awaits tx.wait() separately for confirmation
  } catch (err: any) {
    if (err instanceof WalletError) throw err;
    if (
      err?.code === "ACTION_REJECTED" ||
      err?.message?.toLowerCase().includes("user rejected") ||
      err?.message?.includes("ACTION_REJECTED")
    ) {
      throw new WalletError("ACTION_REJECTED", "User rejected the transaction");
    }
    if (
      err?.code === "INSUFFICIENT_FUNDS" ||
      err?.message?.toLowerCase().includes("insufficient funds")
    ) {
      throw new WalletError("INSUFFICIENT_FUNDS", "Insufficient funds for transfer and gas");
    }
    if (err?.message?.toLowerCase().includes("execution reverted") || err?.data) {
      throw new WalletError("TRANSACTION_REVERTED", err?.message || "Transaction reverted");
    }
    throw new WalletError("RPC_ERROR", err?.message || "RPC network error");
  }
}

/** Deposit reward into JobEscrow for autonomous machine dispatch */
export async function depositToEscrow(
  signer: Signer,
  jobId: string,
  metadataHash: string,
  duration: number,
  description: string,
  amountEth: string
): Promise<TransactionResponse> {
  const escrow = getEscrow(signer);
  return await escrow.createJob(jobId, metadataHash, duration, description, {
    value: parseEther(amountEth),
  });
}

/** Release escrowed funds to machine wallet after verification */
export async function releasePayment(signer: Signer, jobId: string): Promise<TransactionResponse> {
  const escrow = getEscrow(signer);
  return await escrow.release(jobId);
}

/** Gas estimation helper for native transfers */
export async function estimateTransferGas(
  provider: any,
  from: string,
  to: string,
  amountEth: string
): Promise<{ gasLimit: bigint; maxFeePerGas: bigint; estimatedCostEth: string }> {
  const gasLimit = await provider.estimateGas({
    from,
    to,
    value: parseEther(amountEth),
  });
  const feeData = await provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice || 1000000000n;
  const estimatedCostWei = gasLimit * maxFeePerGas;
  const estimatedCostEth = formatEther(estimatedCostWei);
  return { gasLimit, maxFeePerGas, estimatedCostEth };
}

/** Fetch live on-chain balance */
export async function getLiveBalance(address: string): Promise<string> {
  try {
    const provider = getReadProvider();
    const bal = await provider.getBalance(address);
    return Number(formatEther(bal)).toFixed(4);
  } catch {
    return "0.0000";
  }
}

export function getRegistry(runner: any) {
  return new Contract(cfg.addresses.MachineRegistry, cfg.abi.MachineRegistry, runner);
}

export function getEscrow(runner: any) {
  return new Contract(cfg.addresses.JobEscrow, cfg.abi.JobEscrow, runner);
}

/** Turns an ethers revert into the contract's actual custom error name + args. */
export function decodeContractError(e: any, escrow: Contract): string {
  try {
    const data = e?.data ?? e?.info?.error?.data ?? e?.error?.data;
    if (!data) return e?.shortMessage || e?.reason || e?.message || String(e);
    const parsed = escrow.interface.parseError(data);
    if (!parsed) return e?.shortMessage || e?.message || String(e);
    return `${parsed.name}(${parsed.args.join(", ")})`;
  } catch {
    return e?.shortMessage || e?.reason || e?.message || String(e);
  }
}

// -------------------------------------------------------------
// React Context for Wallet State across the app
// -------------------------------------------------------------
export interface WalletContextType {
  address: string | null;
  signer: Signer | null;
  balance: string;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
}

export const WalletContext = createContext<WalletContextType>({
  address: null,
  signer: null,
  balance: "0.00",
  isConnecting: false,
  error: null,
  connect: async () => {},
  disconnect: () => {},
  refreshBalance: async () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}
