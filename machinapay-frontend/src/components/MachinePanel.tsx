import { useEffect, useState } from "react";
import { formatEther, encodeBytes32String, decodeBytes32String } from "ethers";
import { getReadProvider, getRegistry } from "../lib/wallet";
import { cfg, DEFAULT_MACHINE_IDS } from "../lib/config";

interface MachineInfo {
  id: string;
  wallet: string;
  signer: string;
  active: boolean;
  stake: string;
  reputation: string;
  jobsCompleted: number;
  jobsFailed: number;
  balance: string;
}

export function MachinePanel() {
  const [machines, setMachines] = useState<MachineInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const provider = getReadProvider();
      const registry = getRegistry(provider);

      // Dynamically query all machine IDs from the on-chain registry contract
      let targetIds: string[] = [];
      try {
        const onChainBytes32: string[] = await registry.getMachineIds();
        if (onChainBytes32 && onChainBytes32.length > 0) {
          targetIds = onChainBytes32
            .map((b) => {
              try {
                return decodeBytes32String(b);
              } catch {
                return b;
              }
            })
            .filter(Boolean);
        }
      } catch {
        // Fall back to configured list if getMachineIds is unavailable
      }

      if (targetIds.length === 0) {
        targetIds = DEFAULT_MACHINE_IDS;
      }

      const results: MachineInfo[] = [];
      for (const idText of targetIds) {
        let id: string;
        try {
          id = idText.startsWith("0x") && idText.length === 66 ? idText : encodeBytes32String(idText);
        } catch {
          continue;
        }

        const registered = await registry.isRegistered(id);
        if (!registered) continue;

        const m = await registry.getMachine(id);
        const balance = await provider.getBalance(m.wallet);
        results.push({
          id: idText,
          wallet: m.wallet,
          signer: m.signer,
          active: m.active,
          stake: formatEther(m.stake),
          reputation: m.reputation.toString(),
          jobsCompleted: Number(m.jobsCompleted),
          jobsFailed: Number(m.jobsFailed),
          balance: formatEther(balance),
        });
      }
      setMachines(results);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Could not reach the chain");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-dim">Registered machines</h2>
      {error && <p className="text-sm text-bad">{error}</p>}
      {!error && machines.length === 0 && (
        <p className="text-sm text-dim">No registered machine found yet — run Member 1's seed script.</p>
      )}
      <div className="space-y-3">
        {machines.map((m) => (
          <div key={m.id} className="rounded-md border border-line/60 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-base">{m.id}</span>
              <span className={`text-xs font-semibold ${m.active ? "text-ok" : "text-bad"}`}>
                {m.active ? "ACTIVE" : "INACTIVE"}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-dim">Wallet balance</dt>
              <dd className="text-right font-mono">{Number(m.balance).toFixed(3)} {cfg.nativeToken}</dd>
              <dt className="text-dim">Stake</dt>
              <dd className="text-right font-mono">{m.stake} {cfg.nativeToken}</dd>
              <dt className="text-dim">Reputation</dt>
              <dd className="text-right font-mono">{m.reputation}</dd>
              <dt className="text-dim">Jobs completed / failed</dt>
              <dd className="text-right font-mono">{m.jobsCompleted} / {m.jobsFailed}</dd>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
