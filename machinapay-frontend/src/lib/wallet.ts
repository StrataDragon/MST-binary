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

function withTimeout<T>(promise: Promise<T>, ms = 6000, errorMsg = "RPC request timed out"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
  ]);
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
 * Searches for BridgeKey provider via:
 * 1. Dedicated window.bridgekey / window.BridgeKey
 * 2. EIP-6963 announced providers (BridgeKey rdns / uuid)
 * 3. window.ethereum with isBridgeKey flag or inside providers array
 * 4. General window.ethereum fallback
 */
export function findBridgeKeyProvider(): any {
  if (typeof window === "undefined") return null;
  const w = window as any;

  // 1. Direct BridgeKey provider namespace
  if (w.bridgekey && typeof w.bridgekey.request === "function") {
    return w.bridgekey;
  }
  if (w.BridgeKey && typeof w.BridgeKey.request === "function") {
    return w.BridgeKey;
  }

  // 2. Search EIP-6963 announced providers
  for (const detail of announcedProviders.values()) {
    const name = detail.info.name?.toLowerCase() || "";
    const rdns = detail.info.rdns?.toLowerCase() || "";
    const uuid = detail.info.uuid?.toLowerCase() || "";
    if (
      name.includes("bridgekey") ||
      rdns.includes("bridgekey") ||
      rdns === "io.bridgekey.wallet" ||
      uuid === "c8f3e2a1-9b4d-4e7f-a2c1-8d5e6f7a8b9c"
    ) {
      return detail.provider;
    }
  }

  // 3. Search window.ethereum if it has BridgeKey markers
  const eth = w.ethereum;
  if (eth) {
    if (eth.isBridgeKey) return eth;

    if (Array.isArray(eth.providers)) {
      for (const p of eth.providers) {
        const pName = (p.name || "").toLowerCase();
        if (p.isBridgeKey || pName.includes("bridgekey")) {
          return p;
        }
      }
    }
  }

  // 4. Any announced provider
  if (announcedProviders.size > 0) {
    return Array.from(announcedProviders.values())[0].provider;
  }

  // 5. Standard window.ethereum fallback
  if (eth && typeof eth.request === "function") {
    return eth;
  }

  return null;
}

/**
 * Asynchronously waits for BridgeKey or Web3 provider injection
 */
export async function findBridgeKeyProviderAsync(timeoutMs = 1200): Promise<any> {
  if (typeof window === "undefined") return null;

  try {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  } catch {}

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const p = findBridgeKeyProvider();
    if (p) return p;
    await new Promise((r) => setTimeout(r, 60));
  }
  return findBridgeKeyProvider();
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
  const rawProvider = await findBridgeKeyProviderAsync(1200);
  if (!rawProvider) {
    throw new WalletError(
      "NO_PROVIDER",
      "Please install BridgeKey to continue."
    );
  }

  const isBridgeKey = Boolean(
    rawProvider.isBridgeKey ||
    (rawProvider.name && String(rawProvider.name).toLowerCase().includes("bridgekey")) ||
    (typeof window !== "undefined" && (window as any).bridgekey === rawProvider) ||
    Array.from(announcedProviders.values()).some(
      (d) =>
        (d.info.name.toLowerCase().includes("bridgekey") ||
          d.info.rdns.toLowerCase().includes("bridgekey") ||
          d.info.uuid === "c8f3e2a1-9b4d-4e7f-a2c1-8d5e6f7a8b9c") &&
        d.provider === rawProvider
    )
  );

  const walletName = isBridgeKey
    ? "BridgeKey"
    : rawProvider.isMetaMask
    ? "MetaMask"
    : "Web3 Wallet";

  // Request account connection with retry if provider is initializing
  let accounts: string[] = [];
  let lastErr: any = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      accounts = await rawProvider.request({ method: "eth_requestAccounts" });
      if (Array.isArray(accounts) && accounts.length > 0) {
        break;
      }
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message?.toLowerCase() || "";
      if (msg.includes("still loading") || msg.includes("try again in a moment")) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      if (err?.code === 4001 || msg.includes("user rejected") || msg.includes("cancelled")) {
        throw new WalletError("ACTION_REJECTED", "Connection request was rejected in BridgeKey.");
      }
      throw err;
    }
  }

  if (!accounts || accounts.length === 0) {
    try {
      accounts = await rawProvider.request({ method: "eth_accounts" });
    } catch {}
  }

  if (!accounts || accounts.length === 0) {
    if (lastErr) throw lastErr;
    throw new WalletError("NO_ACCOUNTS", "No accounts returned from wallet.");
  }

  // Verify / Switch to required network (only if currently on a different chain)
  try {
    const currentHex = await rawProvider.request({ method: "eth_chainId" }).catch(() => null);
    if (currentHex && parseInt(currentHex, 16) !== cfg.chainId) {
      try {
        await rawProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: hexChainId }],
        });
      } catch (switchErr: any) {
        // If switch fails, attempt to add the chain
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
        } catch {
          // If still different, warn user
          const verifyHex = await rawProvider.request({ method: "eth_chainId" }).catch(() => null);
          if (verifyHex && parseInt(verifyHex, 16) !== cfg.chainId) {
            throw new WalletError(
              "WRONG_NETWORK",
              `Please switch to ${cfg.network} in BridgeKey (Chain ID: ${cfg.chainId}).`
            );
          }
        }
      }
    }
  } catch (chainErr: any) {
    if (chainErr instanceof WalletError) throw chainErr;
    console.warn("Chain verification check:", chainErr);
  }

  const provider = new BrowserProvider(rawProvider);
  const signer = await provider.getSigner();
  const address = accounts[0] || (await signer.getAddress());

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

/** Fetch live on-chain balance via wallet or read-only provider */
export async function getLiveBalance(address: string): Promise<string> {
  // 1. Try directly via wallet provider if available
  try {
    const raw = findBridgeKeyProvider();
    if (raw && typeof raw.request === "function") {
      const hexBal = await withTimeout(
        raw.request({ method: "eth_getBalance", params: [address, "latest"] }),
        3500
      );
      if (hexBal && typeof hexBal === "string") {
        return Number(formatEther(BigInt(hexBal))).toFixed(4);
      }
    }
  } catch {
    // Fallback to read provider
  }

  // 2. Fallback to read-only JSON-RPC provider
  try {
    const provider = getReadProvider();
    const bal = await withTimeout(provider.getBalance(address), 5000);
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
