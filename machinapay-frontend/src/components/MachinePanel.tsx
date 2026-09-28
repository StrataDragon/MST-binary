import { useEffect, useState } from "react";
import { formatEther, encodeBytes32String, decodeBytes32String } from "ethers";
import { getReadProvider, getRegistry } from "../lib/wallet";
import { cfg, DEFAULT_MACHINE_IDS, MEMBER3_API_URL } from "../lib/config";

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
  const [simStatuses, setSimStatuses] = useState<{ [machineId: string]: { connected: boolean; robotState: string } }>({});
  const [backendStatus, setBackendStatus] = useState<"ok" | "unreachable">("ok");

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
    const provider = getReadProvider();
    const registry = getRegistry(provider);
    registry.on("MachineRegistered", load);
    registry.on("MachineReputationUpdated", load);

    let disposed = false;
    const pollSim = async () => {
      try {
        const res = await fetch(`${MEMBER3_API_URL}/api/simulator/status`);
        if (!res.ok) {
          if (!disposed) setBackendStatus("unreachable");
          return;
        }
        const data = await res.json();
        if (!disposed) {
          setBackendStatus("ok");
          const map: { [id: string]: { connected: boolean; robotState: string } } = {};
          for (const m of data.machines || []) {
            map[m.machineId] = { connected: m.connected, robotState: m.robotState };
          }
          setSimStatuses(map);
        }
      } catch {
        if (!disposed) setBackendStatus("unreachable");
      }
    };

    pollSim();
    const timer = setInterval(pollSim, 3000);

    return () => {
      disposed = true;
      clearInterval(timer);
      registry.off("MachineRegistered", load);
      registry.off("MachineReputationUpdated", load);
    };
  }, []);

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-dim">Registered machines</h2>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
            backendStatus === "ok"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
          }`}
        >
          Backend: {backendStatus === "ok" ? "ONLINE" : "UNREACHABLE"}
        </span>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      {!error && machines.length === 0 && (
        <p className="text-sm text-dim">No registered machine found yet — run Member 1's seed script.</p>
      )}
      <div className="space-y-3">
        {machines.map((m) => {
          const sim = simStatuses[m.id];
          return (
            <div key={m.id} className="rounded-md border border-line/60 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-semibold">{m.id}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${m.active ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                    {m.active ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>
                <div className="text-xs font-mono">
                  {backendStatus === "unreachable" ? (
                    <span className="text-amber-400">backend unreachable</span>
                  ) : sim?.connected ? (
                    <span className="text-emerald-400 font-semibold">3D simulator: {sim.robotState}</span>
                  ) : (
                    <span className="text-gray-400">3D simulator offline</span>
                  )}
                </div>
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
          );
        })}
      </div>
    </div>
  );
}
