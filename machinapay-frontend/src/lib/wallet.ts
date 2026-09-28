import React, { createContext, useContext } from "react";
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

// -------------------------------------------------------------
// EIP-6963: Multi-Injected Provider Discovery
// -------------------------------------------------------------
export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: any;
}

const announcedProviders: Map<string, EIP6963ProviderDetail> = new Map();

if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (event: any) => {
    if (event?.detail?.info?.uuid) {
      announcedProviders.set(event.detail.info.uuid, event.detail);
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[EIP-6963 Discovery] Found provider: "${event.detail.info.name}" (${event.detail.info.rdns})`
        );
      }
    }
  });

  try {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  } catch {
    // ignore
  }
}

export function getDiscoveredProviders(): EIP6963ProviderDetail[] {
  return Array.from(announcedProviders.values());
}

/**
 * Searches for BridgeKey provider via EIP-6963, then window.ethereum fallback
 */
export function findBridgeKeyProvider(): any {
  // 1. Search EIP-6963 announced providers
  for (const detail of announcedProviders.values()) {
    const name = detail.info.name?.toLowerCase() || "";
    const rdns = detail.info.rdns?.toLowerCase() || "";
    if (name.includes("bridgekey") || rdns.includes("bridgekey")) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`[BridgeKey Discovery] Selected EIP-6963 BridgeKey provider:`, detail.info);
      }
      return detail.provider;
    }
  }

  // 2. Search window.ethereum
  const eth = typeof window !== "undefined" ? (window as any).ethereum : null;
  if (!eth) return null;

  // If multiple providers injected in window.ethereum.providers
  if (Array.isArray(eth.providers)) {
    for (const p of eth.providers) {
      const pName = (p.name || "").toLowerCase();
      if (p.isBridgeKey || pName.includes("bridgekey")) {
        if (process.env.NODE_ENV !== "production") {
          console.log(`[BridgeKey Discovery] Selected provider from ethereum.providers array.`);
        }
        return p;
      }
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[BridgeKey Discovery] Falling back to standard window.ethereum provider.`);
  }
  return eth;
}

const hexChainId = "0x" + cfg.chainId.toString(16);

/**
 * Read-only provider — uses staticNetwork: true and cacheTimeout: -1
 * so queries work reliably before or without a connected wallet.
 */
export function getReadProvider() {
  return new JsonRpcProvider(cfg.rpcUrl, cfg.chainId, {
    cacheTimeout: -1,
    staticNetwork: true,
  });
}

/**
 * Connects BridgeKey (or injected wallet) and ensures MST Testnet network.
 */
export async function connectWallet(): Promise<{
  provider: BrowserProvider;
  address: string;
  signer: Signer;
  isBridgeKey: boolean;
  walletName: string;
}> {
  const rawProvider = findBridgeKeyProvider();
  if (!rawProvider) {
    throw new WalletError(
      "NO_PROVIDER",
      "Please install BridgeKey to continue."
    );
  }

  const isBridgeKey = Boolean(
    rawProvider.isBridgeKey ||
    (rawProvider.name && String(rawProvider.name).toLowerCase().includes("bridgekey")) ||
    Array.from(announcedProviders.values()).some(
      (d) => (d.info.name.toLowerCase().includes("bridgekey") || d.info.rdns.toLowerCase().includes("bridgekey")) && d.provider === rawProvider
    )
  );

  const walletName = isBridgeKey
    ? "BridgeKey"
    : rawProvider.isMetaMask
    ? "MetaMask"
    : "Web3 Wallet";

  // Request account connection
  await rawProvider.request({ method: "eth_requestAccounts" });

  // Verify / Switch to required network
  try {
    await rawProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch (switchErr: any) {
    // If chain not added or switch unsupported, attempt wallet_addEthereumChain
    let added = false;
    try {
      await rawProvider.request({
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
      added = true;
    } catch {
      // Ignored if add chain fails or is not supported
    }

    if (!added) {
      // Check current chain ID
      try {
        const currentHex = await rawProvider.request({ method: "eth_chainId" });
        if (currentHex && parseInt(currentHex, 16) !== cfg.chainId) {
          throw new WalletError(
            "WRONG_NETWORK",
            `Please switch to ${cfg.network} in BridgeKey (Chain ID: ${cfg.chainId}).`
          );
        }
      } catch (chainErr: any) {
        if (chainErr instanceof WalletError) throw chainErr;
      }
    }
  }

  const provider = new BrowserProvider(rawProvider);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  return { provider, address, signer, isBridgeKey, walletName };
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
    return tx;
  } catch (err: any) {
    if (err instanceof WalletError) throw err;
    if (
      err?.code === "ACTION_REJECTED" ||
      err?.code === 4001 ||
      err?.message?.toLowerCase().includes("user rejected") ||
      err?.message?.includes("ACTION_REJECTED")
    ) {
      throw new WalletError("ACTION_REJECTED", "User rejected transaction in BridgeKey");
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

/** Fetch live on-chain balance via read-only provider */
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
export function decodeContractError(e: any, escrow?: Contract): string {
  try {
    const data = e?.data ?? e?.info?.error?.data ?? e?.error?.data;
    if (data && escrow) {
      const parsed = escrow.interface.parseError(data);
      if (parsed) return `${parsed.name}(${parsed.args.join(", ")})`;
    }
    if (e?.code === "ACTION_REJECTED" || e?.code === 4001) {
      return "Transaction was cancelled by user in BridgeKey.";
    }
    if (e?.code === "INSUFFICIENT_FUNDS") {
      return "Insufficient MSTC in wallet to pay reward and network gas.";
    }
    return e?.shortMessage || e?.reason || e?.message || String(e);
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
