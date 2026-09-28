import { useState } from "react";
import { useLogin, usePrivy, useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";
import { Wallet, LogIn, AlertTriangle } from "lucide-react";

export function ConnectWallet({
  onConnected,
}: {
  onConnected: (address: string, signer: any) => void;
}) {
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin();
  const { wallets } = useWallets();

  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleConnect() {
    setBusy(true);
    setError(null);

    try {
      // If the user isn't logged in with Privy yet, open
      // the Google / Email login screen.
      if (!authenticated) {
        login();
        return;
      }

      // Find the Privy embedded wallet created for the user.
      const wallet = wallets.find(
        (w) =>
          w.walletClientType === "privy" ||
          w.walletClientType === "privy-v2"
      );

      if (!wallet) {
        throw new Error(
          "Privy wallet was not created yet. Please try logging in again."
        );
      }

      // Get the wallet's EIP-1193 provider.
      const ethereumProvider = await wallet.getEthereumProvider();

      // Adapt the Privy provider to the ethers interface
      // already used by MachinaPay.
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      setAddress(userAddress);
      onConnected(userAddress, signer);
    } catch (e: any) {
      console.error("Privy wallet connection failed:", e);

      setError(
        e?.message || "Could not connect your Privy wallet"
      );
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 rounded-full bg-accent-blue text-white px-3.5 py-1.5 text-xs font-semibold opacity-50"
      >
        <Wallet className="w-3.5 h-3.5" />
        <span>Loading...</span>
      </button>
    );
  }

  if (address) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-mono text-accent-green font-semibold">
        <span className="h-2 w-2 rounded-full bg-accent-green animate-pulse" />
        <span>
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="flex items-center gap-1 text-[11px] text-accent-red font-mono truncate max-w-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </span>
      )}

      <button
        onClick={handleConnect}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-full bg-accent-blue hover:bg-blue-600 text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
      >
        {authenticated ? (
          <Wallet className="w-3.5 h-3.5" />
        ) : (
          <LogIn className="w-3.5 h-3.5" />
        )}

        <span>
          {busy
            ? "Connecting..."
            : authenticated
              ? "Connect Wallet"
              : "Login"}
        </span>
      </button>
    </div>
  );
}