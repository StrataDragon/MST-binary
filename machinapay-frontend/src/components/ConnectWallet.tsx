import { useState } from "react";
import { connectWallet, WalletError } from "../lib/wallet";
import { cfg } from "../lib/config";
import { Wallet, ExternalLink, AlertTriangle } from "lucide-react";

export function ConnectWallet({ onConnected }: { onConnected: (address: string, signer: any) => void }) {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; isNoProvider: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      const { provider, address, signer } = await connectWallet();
      setAddress(address);
      onConnected(address, signer);
    } catch (e: any) {
      const isNoProvider =
        e?.code === "NO_PROVIDER" ||
        e?.message?.toLowerCase().includes("no web3 wallet") ||
        e?.message?.toLowerCase().includes("install metamask");
      setError({
        message: e?.message || "Could not connect wallet",
        isNoProvider,
      });
    } finally {
      setBusy(false);
    }
  }

  if (address) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-mono text-accent-green font-semibold">
        <span className="h-2 w-2 rounded-full bg-accent-green animate-pulse" />
        <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        error.isNoProvider ? (
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-300 bg-amber-50 text-accent-amber hover:bg-amber-100 text-xs font-mono font-semibold transition-colors"
            title="MetaMask or compatible Web3 wallet is required. Click to download."
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Install MetaMask</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="text-[11px] text-accent-red font-mono truncate max-w-xs">{error.message}</span>
        )
      )}
      <button
        onClick={handleConnect}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-full bg-accent-blue hover:bg-blue-600 text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
      >
        <Wallet className="w-3.5 h-3.5" />
        <span>{busy ? "Connecting…" : "Connect Wallet"}</span>
      </button>
    </div>
  );
}
