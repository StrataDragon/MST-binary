import React, { useState, useEffect } from "react";
import { BrowserProvider } from "ethers";
import { useSafePrivy, useSafeLogin, useSafeWallets } from "../PrivyProvider";
import {
  connectWallet,
  findBridgeKeyProviderAsync,
  findBridgeKeyProvider,
  getLiveBalance,
  getReadProvider,
} from "../lib/wallet";
import { cfg, NATIVE_SYMBOL } from "../lib/config";
import {
  Wallet,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShieldCheck,
  LogIn,
  LogOut,
} from "lucide-react";

export function ConnectWallet({
  onConnected,
  clientAddress,
  onDisconnect,
}: {
  onConnected: (address: string, signer: any) => void;
  clientAddress?: string | null;
  onDisconnect?: () => void;
}) {
  const {
    isConfigured: privyConfigured,
    ready: privyReady,
    authenticated: privyAuthenticated,
    logout: privyLogout,
  } = useSafePrivy();
  const { login: privyLogin } = useSafeLogin();
  const { wallets } = useSafeWallets();

  const [address, setAddress] = useState<string | null>(clientAddress || null);
  const [balance, setBalance] = useState<string>("0.0000");
  const [walletName, setWalletName] = useState<string>("BridgeKey");
  const [activeWalletType, setActiveWalletType] = useState<"bridgekey" | "privy" | null>(null);
  const [error, setError] = useState<{ message: string; isNoProvider?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [rpcResponding, setRpcResponding] = useState(true);
  const [privyTimedOut, setPrivyTimedOut] = useState(false);

  // Sync internal address with clientAddress prop from parent
  useEffect(() => {
    if (clientAddress !== undefined) {
      setAddress(clientAddress);
      if (clientAddress) {
        getLiveBalance(clientAddress)
          .then((b) => setBalance(b))
          .catch(() => {});
      } else {
        setBalance("0.0000");
        setActiveWalletType(null);
      }
    }
  }, [clientAddress]);

  // Monitor Privy init timeout (~8s)
  useEffect(() => {
    if (privyConfigured && !privyReady) {
      const timer = setTimeout(() => {
        setPrivyTimedOut(true);
      }, 8000);
      return () => clearTimeout(timer);
    } else {
      setPrivyTimedOut(false);
    }
  }, [privyConfigured, privyReady]);

  // Check RPC connectivity on mount
  useEffect(() => {
    let mounted = true;
    async function checkRpc() {
      try {
        const provider = getReadProvider();
        await provider.getBlockNumber();
        if (mounted) setRpcResponding(true);
      } catch {
        if (mounted) setRpcResponding(false);
      }
    }
    checkRpc();
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-connect Privy wallet when authenticated
  useEffect(() => {
    let mounted = true;
    async function syncPrivyWallet() {
      if (!privyConfigured || !privyAuthenticated || !wallets || wallets.length === 0) return;
      if (address && activeWalletType === "bridgekey") return; // Respect explicit BridgeKey selection

      const privyWallet =
        wallets.find(
          (w) => w.walletClientType === "privy" || w.walletClientType === "privy-v2"
        ) || wallets[0];

      if (privyWallet && mounted) {
        try {
          // Ensure embedded wallet is on MST Testnet (chainId 91562037)
          if (privyWallet.chainId !== "eip155:91562037" && privyWallet.chainId !== 91562037) {
            try {
              await privyWallet.switchChain(91562037);
            } catch (switchErr: any) {
              console.warn("[Privy] switchChain to 91562037 warning:", switchErr);
            }
          }

          const ethereumProvider = await privyWallet.getEthereumProvider();
          const provider = new BrowserProvider(ethereumProvider, "any");
          const signer = await provider.getSigner();
          const userAddress = await signer.getAddress();
          if (mounted) {
            setAddress(userAddress);
            setWalletName("Privy Wallet");
            setActiveWalletType("privy");
            onConnected(userAddress, signer);
            const b = await getLiveBalance(userAddress);
            setBalance(b);
          }
        } catch (e: any) {
          console.warn("Privy auto-sync warning:", e);
        }
      }
    }

    syncPrivyWallet();
    return () => {
      mounted = false;
    };
  }, [privyConfigured, privyAuthenticated, wallets, address, activeWalletType]);

  // Auto-detect existing authorized session for BridgeKey on mount if Privy not active
  useEffect(() => {
    let mounted = true;

    async function checkExistingAuth() {
      if (activeWalletType === "privy") return;
      try {
        const raw = await findBridgeKeyProviderAsync(1000);
        if (!raw || !mounted) return;

        const accounts: string[] = await raw.request({ method: "eth_accounts" });
        if (mounted && Array.isArray(accounts) && accounts.length > 0 && accounts[0]) {
          const provider = new BrowserProvider(raw, "any");
          const addr = accounts[0];
          setAddress(addr);
          setWalletName(raw.isBridgeKey || (window as any).bridgekey ? "BridgeKey" : "Web3 Wallet");
          setActiveWalletType("bridgekey");
          const signer = await provider.getSigner(addr).catch(async () => {
            return await provider.getSigner().catch(() => null);
          });
          if (signer) {
            onConnected(addr, signer);
          }
          const bal = await getLiveBalance(addr);
          if (mounted) setBalance(bal);
        }
      } catch {
        // Non-blocking
      }
    }

    checkExistingAuth();

    function handleAccountsChanged(accs: string[]) {
      if (!mounted) return;
      if (activeWalletType === "privy") {
        // Do not let background BridgeKey accountsChanged events override active Privy session
        return;
      }
      if (!accs || accs.length === 0) {
        setAddress(null);
        setActiveWalletType(null);
        setBalance("0.0000");
        onDisconnect?.();
      } else {
        const newAddr = accs[0];
        setAddress(newAddr);
        setActiveWalletType("bridgekey");
        const raw = findBridgeKeyProvider();
        if (raw) {
          const provider = new BrowserProvider(raw, "any");
          provider
            .getSigner(newAddr)
            .then((s) => {
              if (mounted) onConnected(newAddr, s);
            })
            .catch(() => {});
        }
        getLiveBalance(newAddr).then((b) => {
          if (mounted) setBalance(b);
        });
      }
    }

    function handleChainChanged() {
      if (activeWalletType === "bridgekey") {
        window.location.reload();
      }
    }

    const raw = findBridgeKeyProvider();
    if (raw?.on) {
      raw.on("accountsChanged", handleAccountsChanged);
      raw.on("chainChanged", handleChainChanged);
    }

    const handleInitialized = () => {
      checkExistingAuth();
    };
    window.addEventListener("bridgekey#initialized", handleInitialized);
    window.addEventListener("ethereum#initialized", handleInitialized);

    return () => {
      mounted = false;
      if (raw?.removeListener) {
        raw.removeListener("accountsChanged", handleAccountsChanged);
        raw.removeListener("chainChanged", handleChainChanged);
      }
      window.removeEventListener("bridgekey#initialized", handleInitialized);
      window.removeEventListener("ethereum#initialized", handleInitialized);
    };
  }, [activeWalletType]);

  // Connect via BridgeKey
  async function handleConnectBridgeKey() {
    setBusy(true);
    setError(null);
    try {
      const res = await connectWallet();
      setAddress(res.address);
      setWalletName(res.walletName);
      setActiveWalletType("bridgekey");
      onConnected(res.address, res.signer);

      const bal = await getLiveBalance(res.address);
      setBalance(bal);
    } catch (e: any) {
      console.error("Connect BridgeKey error:", e);
      const isNoProvider =
        e?.code === "NO_PROVIDER" ||
        e?.message?.toLowerCase().includes("please install bridgekey") ||
        e?.message?.toLowerCase().includes("no web3 wallet");

      setError({
        message: e?.message || "Could not connect BridgeKey wallet",
        isNoProvider,
      });
    } finally {
      setBusy(false);
    }
  }

  // Connect via Privy (Google/Email)
  async function handleConnectPrivy() {
    if (!privyConfigured) {
      setError({
        message: "Privy is not configured in .env (set VITE_PRIVY_APP_ID)",
      });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (!privyAuthenticated) {
        privyLogin();
        setBusy(false);
        return;
      }

      const wallet =
        wallets.find(
          (w) => w.walletClientType === "privy" || w.walletClientType === "privy-v2"
        ) || wallets[0];

      if (!wallet) {
        throw new Error("Privy embedded wallet not ready. Please try logging in again.");
      }

      // Ensure embedded wallet is on MST Testnet (chainId 91562037)
      if (wallet.chainId !== "eip155:91562037" && wallet.chainId !== 91562037) {
        try {
          await wallet.switchChain(91562037);
        } catch (switchErr: any) {
          console.warn("[Privy] switchChain to 91562037 warning:", switchErr);
        }
      }

      const ethereumProvider = await wallet.getEthereumProvider();
      const provider = new BrowserProvider(ethereumProvider, "any");
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      setAddress(userAddress);
      setWalletName("Privy Wallet");
      setActiveWalletType("privy");
      onConnected(userAddress, signer);

      const bal = await getLiveBalance(userAddress);
      setBalance(bal);
    } catch (e: any) {
      console.error("Privy connection failed:", e);
      setError({
        message: e?.message || "Could not connect your Privy wallet",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (activeWalletType === "privy" && privyAuthenticated) {
      await privyLogout().catch(() => {});
    }
    setAddress(null);
    setActiveWalletType(null);
    setBalance("0.0000");
    setShowDetails(false);
    onDisconnect?.();
  }

  function handleCopy() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function refreshBalance() {
    if (!address) return;
    const b = await getLiveBalance(address);
    setBalance(b);
  }

  // --- Authenticated / Connected Wallet View ---
  if (address) {
    const isZeroBalance = Number(balance) === 0 || balance === "0.0000";

    return (
      <div className="relative">
        <div className="flex items-center gap-2">
          {/* Status Pill with network, balance & truncated address */}
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3 py-1 text-xs font-mono text-cyan-300 hover:border-cyan-400 transition shadow-xs cursor-pointer"
            title="Click to view wallet verification checklist and connection details"
          >
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-semibold text-white">{walletName}</span>
            <span className="text-gray-400">|</span>
            <span className={isZeroBalance ? "text-amber-400 font-bold" : ""}>
              {balance} {NATIVE_SYMBOL}
            </span>
            <span className="text-gray-400">|</span>
            <span>
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
            {showDetails ? (
              <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            )}
          </button>

          {/* Copy Address Button */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition cursor-pointer"
            title="Copy wallet address"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Disconnect / Logout Button */}
          <button
            type="button"
            onClick={handleDisconnect}
            className="p-1.5 rounded-full hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition cursor-pointer"
            title={`Disconnect ${walletName}`}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Collapsible Technical Details / Verification Checklist */}
        {showDetails && (
          <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl z-50 p-4 font-mono text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                Wallet Status
              </span>
              <button
                type="button"
                onClick={refreshBalance}
                className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>

            {/* Zero Balance Faucet Alert inside details */}
            {isZeroBalance && (
              <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-1.5 text-[11px]">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Zero Balance Alert</span>
                </div>
                <p className="text-[10px] leading-tight text-amber-200/90 font-sans">
                  This wallet has 0 {NATIVE_SYMBOL}. Fund it with free testnet coins to post jobs:
                </p>
                <a
                  href="https://faucet.mstblockchain.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline font-bold"
                >
                  <span>Open MST Faucet</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* Verification Checklist Rows */}
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between text-gray-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Wallet Provider
                </span>
                <span className="text-gray-400">{walletName}</span>
              </div>
              <div className="flex items-center justify-between text-gray-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> MST Testnet
                </span>
                <span className="text-gray-400">ID: {cfg.chainId}</span>
              </div>
              <div className="flex items-center justify-between text-gray-300">
                <span className="flex items-center gap-1.5">
                  {rpcResponding ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  RPC Responding
                </span>
                <span className={rpcResponding ? "text-green-400" : "text-amber-400"}>
                  {rpcResponding ? "Active" : "Lagging"}
                </span>
              </div>
              <div className="flex items-center justify-between text-gray-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Balance Readable
                </span>
                <span className={`font-semibold ${isZeroBalance ? "text-amber-400" : "text-cyan-400"}`}>
                  {balance} {NATIVE_SYMBOL}
                </span>
              </div>
            </div>

            {/* Technical Metadata */}
            <div className="pt-2 border-t border-gray-800 space-y-1 text-[10px] text-gray-400">
              <div className="truncate">
                <span className="text-gray-500">RPC:</span> {cfg.rpcUrl}
              </div>
              <div className="truncate">
                <span className="text-gray-500">Escrow:</span> {cfg.addresses.JobEscrow}
              </div>
              <div className="truncate">
                <span className="text-gray-500">Registry:</span> {cfg.addresses.MachineRegistry}
              </div>
              {cfg.explorerUrl && (
                <div>
                  <a
                    href={`${cfg.explorerUrl}/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:underline inline-flex items-center gap-1"
                  >
                    View Address on Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Switch / Disconnect Actions */}
            <div className="pt-2 border-t border-gray-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleDisconnect}
                className="text-[11px] text-red-400 hover:underline flex items-center gap-1"
              >
                <LogOut className="w-3 h-3" /> Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Disconnected / Demo Mode View ---
  return (
    <div className="flex items-center gap-2">
      {/* Demo Mode / Disconnected Badge */}
      <span className="text-[11px] font-mono text-gray-400 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700">
        Demo Mode (Disconnected)
      </span>

      {error && (
        error.isNoProvider ? (
          <a
            href="https://chromewebstore.google.com/detail/bridgekey/bfjojdcfenehemjgjlepdjomkpginlkg"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 text-xs font-mono font-semibold transition shadow-xs"
            title="BridgeKey Chrome extension required for signing customer job escrows."
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Install BridgeKey</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="text-[11px] text-red-500 font-mono truncate max-w-xs">{error.message}</span>
        )
      )}

      {/* BridgeKey Connect Button */}
      <button
        type="button"
        onClick={handleConnectBridgeKey}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-1.5 text-xs font-mono font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
        title="Connect using BridgeKey extension or injected Web3 provider"
      >
        <Wallet className="w-3.5 h-3.5" />
        <span>{busy ? "Connecting..." : "BridgeKey"}</span>
      </button>

      {/* Privy Social / Email Login Button (Task 3 State Machine) */}
      {!privyConfigured ? (
        <button
          type="button"
          disabled={true}
          title="Privy not configured (set VITE_PRIVY_APP_ID)"
          className="flex items-center gap-1.5 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-mono cursor-not-allowed opacity-75"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>Privy not configured</span>
        </button>
      ) : !privyReady ? (
        privyTimedOut ? (
          <button
            type="button"
            disabled={true}
            title="Privy failed to initialise, check the browser console / allowed origins"
            className="flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 px-3 py-1.5 text-xs font-mono cursor-not-allowed"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Privy init failed</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={true}
            title="Initializing Privy embedded wallet SDK..."
            className="flex items-center gap-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 px-3 py-1.5 text-xs font-mono cursor-wait animate-pulse"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Initializing Privy...</span>
          </button>
        )
      ) : (
        <button
          type="button"
          onClick={handleConnectPrivy}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 text-xs font-mono font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
          title={
            privyAuthenticated
              ? "Connect with active Privy embedded wallet"
              : "Login with Google or Email using Privy embedded wallet"
          }
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>{privyAuthenticated ? "Privy Wallet" : "Privy Login"}</span>
        </button>
      )}
    </div>
  );
}