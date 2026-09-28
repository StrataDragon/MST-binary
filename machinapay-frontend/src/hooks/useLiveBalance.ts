import { useState, useEffect, useCallback, useRef } from "react";
import { formatEther } from "ethers";
import { getReadProvider } from "../lib/wallet";

export function useLiveBalance(address: string | null, pollIntervalMs = 6000) {
  const [balance, setBalance] = useState<string>("0.0000");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const lastFetchRef = useRef<number>(0);

  const fetchBalance = useCallback(async () => {
    if (!address) {
      setBalance("0.0000");
      return;
    }

    // Debounce checks within 1.5 seconds
    const now = Date.now();
    if (now - lastFetchRef.current < 1500) return;
    lastFetchRef.current = now;

    try {
      setIsLoading(true);
      const provider = getReadProvider();
      const bal = await provider.getBalance(address);
      setBalance(Number(formatEther(bal)).toFixed(4));
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to query balance");
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchBalance();
    const provider = getReadProvider();
    provider.on("block", fetchBalance);
    return () => {
      provider.off("block", fetchBalance);
    };
  }, [fetchBalance]);

  return { balance, isLoading, error, refresh: fetchBalance };
}
