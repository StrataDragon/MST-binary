import React, { useState, useEffect, useMemo } from "react";
import { formatEther, decodeBytes32String } from "ethers";
import {
  Lock,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  TrendingUp,
  Copy,
  Check,
  Bot,
  RefreshCw
} from "lucide-react";
import { cfg, NATIVE_SYMBOL, getContractConfig } from "../lib/config";
import { getReadProvider, getEscrow, getRegistry } from "../lib/wallet";
import { getMachineProfile } from "../lib/machineProfiles";
import { JobSummary } from "./JobList";

interface OverviewViewProps {
  jobs: JobSummary[];
  tvl: string;
  activeJobsCount: number;
  paidJobsCount: number;
  clientBalance: string;
}

interface MachineOverviewItem {
  id: string;
  role: string;
  address: string;
  balance: string;
  stake: string;
  jobsCompleted: number;
  jobsFailed: number;
  active: boolean;
  reputation: number;
}

export function OverviewView({
  jobs,
  tvl,
  activeJobsCount,
  paidJobsCount,
  clientBalance,
}: OverviewViewProps) {
  const [machines, setMachines] = useState<MachineOverviewItem[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

  // Settlement volume per day from on-chain jobs
  const [dailyVolume, setDailyVolume] = useState<{ day: string; volume: number; count: number }[]>([]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const fetchOverviewData = async () => {
    setLoadingMachines(true);
    setError(null);
    try {
      const provider = getReadProvider();
      const registry = getRegistry(provider);
      const escrow = getEscrow(provider);

      // 1. Fetch registered machines safely
      const rawIds: string[] = await registry.getMachineIds().catch(() => []);
      const items: MachineOverviewItem[] = [];

      for (const idBytes of rawIds) {
        let idStr = "UNKNOWN";
        try {
          idStr = decodeBytes32String(idBytes);
        } catch {
          idStr = idBytes.slice(0, 10);
        }

        const m = await registry.getMachine(idBytes).catch(() => null);
        if (!m) continue;
        const profile = getMachineProfile(idStr);

        let bal = "0.00";
        try {
          const b = await provider.getBalance(m.wallet);
          bal = parseFloat(formatEther(b)).toFixed(3);
        } catch {}

        items.push({
          id: idStr,
          role: profile?.name || "Autonomous Machine",
          address: m.wallet,
          balance: `${bal} ${NATIVE_SYMBOL}`,
          stake: `${formatEther(m.stake)} ${NATIVE_SYMBOL}`,
          jobsCompleted: Number(m.jobsCompleted),
          jobsFailed: Number(m.jobsFailed),
          active: m.active,
          reputation: Number(m.reputation),
        });
      }

      setMachines(items);

      // 2. Fetch past 30 days settlement volume from PaymentReleased logs
      const releasedLogs = await escrow.queryFilter(escrow.filters.PaymentReleased(), -2000).catch(() => []);
      const daysMap = new Map<string, { volume: number; count: number }>();
      const now = new Date();

      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        daysMap.set(key, { volume: 0, count: 0 });
      }

      for (const log of releasedLogs) {
        if ("args" in log && log.args) {
          const reward = parseFloat(formatEther(log.args[2] || 0));
          const b = await provider.getBlock(log.blockNumber).catch(() => null);
          const t = b?.timestamp ? new Date(b.timestamp * 1000) : new Date();
          const key = `${t.getMonth() + 1}/${t.getDate()}`;
          if (daysMap.has(key)) {
            const entry = daysMap.get(key)!;
            entry.volume += reward;
            entry.count += 1;
          }
        }
      }

      const volList: { day: string; volume: number; count: number }[] = [];
      daysMap.forEach((v, day) => {
        volList.push({ day, volume: Math.round(v.volume * 100) / 100, count: v.count });
      });
      setDailyVolume(volList);
    } catch (err: any) {
      console.warn("Error fetching overview data:", err);
      // Suppress un-deployed bytecode decode errors
      if (!err?.message?.includes("could not decode result data") && !err?.message?.includes("BAD_DATA")) {
        setError(err?.message || "Failed to load on-chain overview data");
      }
    } finally {
      setLoadingMachines(false);
    }
  };

  useEffect(() => {
    fetchOverviewData();
  }, []);

  const handleCopy = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddr(addr);
    setTimeout(() => setCopiedAddr(null), 1500);
  };

  const refundedJobsCount = useMemo(() => jobs.filter((j) => j.state === 7).length, [jobs]);

  // Stat Tiles derived from real chain state
  const statTiles = [
    {
      label: "Active Jobs",
      value: `${activeJobsCount}`,
      sub: "In escrow execution",
      barClass: "bg-blue-600",
      pct: Math.min(100, (activeJobsCount / Math.max(1, jobs.length)) * 100),
    },
    {
      label: `Escrow TVL (${NATIVE_SYMBOL})`,
      value: `${tvl} ${NATIVE_SYMBOL}`,
      sub: "Smart contract vault",
      barClass: "bg-emerald-600",
      pct: 100,
    },
    {
      label: "Jobs Settled (Paid)",
      value: `${paidJobsCount}`,
      sub: "Released to machines",
      barClass: "bg-emerald-500",
      pct: Math.min(100, (paidJobsCount / Math.max(1, jobs.length)) * 100),
    },
    {
      label: "Refunded Jobs",
      value: `${refundedJobsCount}`,
      sub: "Returned to customers",
      barClass: "bg-amber-500",
      pct: Math.min(100, (refundedJobsCount / Math.max(1, jobs.length)) * 100),
    },
    {
      label: "Registered Fleet",
      value: `${machines.length}`,
      sub: "Active autonomous units",
      barClass: "bg-purple-600",
      pct: 100,
    },
    {
      label: "Connected Balance",
      value: `${clientBalance} ${NATIVE_SYMBOL}`,
      sub: "Customer wallet",
      barClass: "bg-sky-500",
      pct: 100,
    },
  ];

  // Max volume for scaling
  const maxVolume = useMemo(() => {
    const max = Math.max(...dailyVolume.map((d) => d.volume), 10);
    return max;
  }, [dailyVolume]);

  return (
    <div className="space-y-6 font-sans">
      {/* 1. Header with Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">System Overview</h1>
          <p className="text-xs text-gray-600">Live on-chain metrics and registered fleet health.</p>
        </div>
        <button
          onClick={fetchOverviewData}
          disabled={loadingMachines}
          className="p-2 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg text-gray-600 transition-colors shadow-xs"
          title="Refresh on-chain state"
        >
          <RefreshCw className={`w-4 h-4 ${loadingMachines ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. 6 Stat Tiles Grid (White Cards with light grey border) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statTiles.map((tile, idx) => (
          <div
            key={idx}
            className="bg-white border border-gray-200 rounded-xl shadow-xs p-4 flex flex-col justify-between"
          >
            <div>
              <span className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                {tile.label}
              </span>
              <div className="text-xl font-bold font-mono text-gray-900 mt-1 tracking-tight">
                {tile.value}
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              <div className="text-[10px] text-gray-500 truncate">{tile.sub}</div>
              <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${tile.barClass}`}
                  style={{ width: `${tile.pct}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 3. 2-Column Section: 30d Settlement Trajectory & Machine Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): 30-Day Settlement Volume */}
        <div className="lg:col-span-8 bg-white border border-gray-200 rounded-xl shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900 tracking-wide">
                Settlement Volume ({NATIVE_SYMBOL}) — 30-Day Trajectory
              </h2>
              <p className="text-xs text-gray-500">
                Daily native coin settlement volume released to autonomous machines.
              </p>
            </div>
            {hoverIdx !== null && dailyVolume[hoverIdx] && (
              <div className="text-xs font-mono px-2.5 py-1 rounded bg-gray-900 text-white">
                <span>{dailyVolume[hoverIdx].day}: </span>
                <span className="font-bold text-emerald-400">
                  {dailyVolume[hoverIdx].volume} {NATIVE_SYMBOL}
                </span>{" "}
                ({dailyVolume[hoverIdx].count} jobs)
              </div>
            )}
          </div>

          {/* Volume Chart */}
          <div className="h-44 flex items-end gap-1.5 pt-6 pb-2 px-2 bg-[#f6f7f9] rounded-lg border border-gray-200 overflow-x-auto">
            {dailyVolume.map((d, idx) => {
              const heightPercent = d.volume > 0 ? Math.max(12, (d.volume / maxVolume) * 100) : 0;
              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoverIdx(idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                  className="flex-1 min-w-[18px] h-full flex flex-col justify-end items-center group cursor-pointer"
                >
                  {d.volume > 0 ? (
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className="w-full bg-blue-600 rounded-t group-hover:bg-blue-700 transition-all"
                    />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mb-1" />
                  )}
                  <div className="text-[9px] text-gray-500 mt-2 font-mono truncate w-full text-center">
                    {idx % 5 === 0 ? d.day : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column (4 cols): Machine Fleet Balances */}
        <div className="lg:col-span-4 bg-white border border-gray-200 rounded-xl shadow-xs p-5 space-y-4">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-sm font-bold text-gray-900 tracking-wide">
              Machine Fleet Balances
            </h2>
            <p className="text-xs text-gray-500">
              On-chain balance and reputation per registered machine.
            </p>
          </div>

          {loadingMachines ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-16 bg-gray-100 rounded-lg" />
              <div className="h-16 bg-gray-100 rounded-lg" />
            </div>
          ) : machines.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-500 border border-dashed border-gray-200 rounded-lg">
              No machines registered yet.
            </div>
          ) : (
            <div className="space-y-3">
              {machines.map((m) => (
                <div key={m.id} className="p-3.5 rounded-lg border border-gray-200 bg-[#f6f7f9] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-blue-600" />
                      <span className="font-bold font-mono text-xs text-gray-900">{m.id}</span>
                      <span className="text-[11px] text-gray-600 font-sans">({m.role})</span>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        m.active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-gray-100 text-gray-600 border-gray-200"
                      }`}
                    >
                      {m.active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-mono text-gray-600">
                      <span>{`${m.address.slice(0, 6)}...${m.address.slice(-4)}`}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(m.address)}
                        className="text-gray-400 hover:text-gray-700 transition-colors"
                        title="Copy address"
                      >
                        {copiedAddr === m.address ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <span className="font-mono font-bold text-gray-900">{m.balance}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-gray-500 border-t border-gray-200 pt-1.5">
                    <span>Stake: {m.stake}</span>
                    <span>Rep: {m.reputation}/100</span>
                    <span>{m.jobsCompleted} Completed</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
            <span>Your Connected Balance:</span>
            <span className="font-mono font-bold text-gray-900">
              {clientBalance} {NATIVE_SYMBOL}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
