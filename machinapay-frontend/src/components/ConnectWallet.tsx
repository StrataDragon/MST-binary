import React, { useState, useEffect } from "react";
import { BrowserProvider } from "ethers";
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
  const [address, setAddress] = useState<string | null>(clientAddress || null);
  const [balance, setBalance] = useState<string>("0.0000");
  const [walletName, setWalletName] = useState<string>("BridgeKey");
  const [error, setError] = useState<{ message: string; isNoProvider: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [rpcResponding, setRpcResponding] = useState(true);

  // Synchronize internal address with clientAddress prop
  useEffect(() => {
    if (clientAddress !== undefined) {
      setAddress(clientAddress);
      if (clientAddress) {
        getLiveBalance(clientAddress).then((b) => setBalance(b)).catch(() => {});
      } else {
        setBalance("0.0000");
      }
    }
  }, [clientAddress]);

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

  // Auto-detect existing authorized session on mount or when BridgeKey initializes
  useEffect(() => {
    let mounted = true;

    async function checkExistingAuth() {
      try {
        const raw = await findBridgeKeyProviderAsync(1000);
        if (!raw || !mounted) return;

        const accounts: string[] = await raw.request({ method: "eth_accounts" });
        if (mounted && Array.isArray(accounts) && accounts.length > 0 && accounts[0]) {
          const provider = new BrowserProvider(raw, "any");
          const addr = accounts[0];
          setAddress(addr);
          setWalletName(raw.isBridgeKey || (window as any).bridgekey ? "BridgeKey" : "Web3 Wallet");
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
      if (!accs || accs.length === 0) {
        setAddress(null);
        setBalance("0.0000");
        onDisconnect?.();
      } else {
        const newAddr = accs[0];
        setAddress(newAddr);
        const raw = findBridgeKeyProvider();
        if (raw) {
          const provider = new BrowserProvider(raw, "any");
          provider.getSigner(newAddr).then((s) => {
            if (mounted) onConnected(newAddr, s);
          }).catch(() => {
            provider.getSigner().then((s) => {
              if (mounted) onConnected(newAddr, s);
            }).catch(() => {});
          });
        }
        getLiveBalance(newAddr).then((b) => {
          if (mounted) setBalance(b);
        });
      }
    }

    function handleChainChanged() {
      window.location.reload();
    }

    const raw = findBridgeKeyProvider();
    if (raw?.on) {
      raw.on("accountsChanged", handleAccountsChanged);
      raw.on("chainChanged", handleChainChanged);
    }

    // Also listen to custom initialization events from BridgeKey
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
  }, []);

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      const res = await connectWallet();
      setAddress(res.address);
      setWalletName(res.walletName);
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

  if (address) {
    return (
      <div className="relative">
        <div className="flex items-center gap-2">
          {/* Status Pill with network & truncated address */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3 py-1 text-xs font-mono text-cyan-300 hover:border-cyan-400 transition shadow-xs cursor-pointer"
            title="Click to view BridgeKey verification checklist and connection details"
          >
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-semibold text-white">{cfg.network}</span>
            <span className="text-gray-400">|</span>
            <span>{balance} {NATIVE_SYMBOL}</span>
            <span className="text-gray-400">|</span>
            <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
            {showDetails ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
          </button>

          {/* Copy Address Button */}
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition cursor-pointer"
            title="Copy wallet address"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsible Technical Details / Verification Checklist */}
        {showDetails && (
          <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl z-50 p-4 font-mono text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                BridgeKey Status
              </span>
              <button
                onClick={refreshBalance}
                className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>

            {/* Verification Checklist Rows */}
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between text-gray-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Wallet Connected
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
                <span className="text-cyan-400 font-semibold">{balance} {NATIVE_SYMBOL}</span>
              </div>
            </div>

            {/* Technical Metadata */}
            <div className="pt-2 border-t border-gray-800 space-y-1 text-[10px] text-gray-400">
              <div className="truncate"><span className="text-gray-500">RPC:</span> {cfg.rpcUrl}</div>
              <div className="truncate"><span className="text-gray-500">Escrow:</span> {cfg.addresses.JobEscrow}</div>
              <div className="truncate"><span className="text-gray-500">Registry:</span> {cfg.addresses.MachineRegistry}</div>
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

            {/* Disclaimer */}
            <div className="pt-2 border-t border-gray-800/80 text-[10px] text-amber-300/80 bg-amber-500/10 p-2 rounded">
              MST Testnet - test coins have no real value.
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
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

      <button
        onClick={handleConnect}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-1.5 text-xs font-mono font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
      >
        <Wallet className="w-3.5 h-3.5" />
        <span>{busy ? "Connecting..." : "Connect BridgeKey"}</span>
      </button>
    </div>
  );
}
