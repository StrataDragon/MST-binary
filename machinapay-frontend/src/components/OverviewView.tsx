import React, { useState } from "react";
import { formatEther } from "ethers";
import {
  Lock,
  Zap,
  Activity,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Cpu,
  ArrowUpRight,
  TrendingUp,
  Download,
} from "lucide-react";
import { cfg } from "../lib/config";
import { JobSummary } from "./JobList";

interface OverviewViewProps {
  jobs: JobSummary[];
  tvl: string;
  activeJobsCount: number;
  paidJobsCount: number;
  clientBalance: string;
}

export function OverviewView({
  jobs,
  tvl,
  activeJobsCount,
  paidJobsCount,
  clientBalance,
}: OverviewViewProps) {
  const [hoverDay, setHoverDay] = useState<number>(27);

  // 6 Stat Tiles
  const statTiles = [
    {
      label: "Active Jobs",
      value: `${activeJobsCount || jobs.length}`,
      delta: "+12.4% vs 7d",
      deltaTone: "text-accent-green",
      progress: 78,
      barClass: "bg-accent-blue",
      sub: "In escrow execution",
    },
    {
      label: "Escrow TVL (ETH)",
      value: `${tvl} ${cfg.nativeToken}`,
      delta: "+100% locked",
      deltaTone: "text-accent-green",
      progress: 92,
      barClass: "bg-accent-green",
      sub: "Smart contract vault",
    },
    {
      label: "Avg Settlement Time",
      value: "1.2s",
      delta: "-0.4s fast finality",
      deltaTone: "text-accent-green",
      progress: 95,
      barClass: "bg-accent-green",
      sub: "Dual EIP-712 latency",
    },
    {
      label: "Failed / Disputed Jobs",
      value: "0",
      delta: "0.0% dispute rate",
      deltaTone: "text-accent-green",
      progress: 100,
      barClass: "bg-accent-green",
      sub: "Zero slashed collateral",
    },
    {
      label: "Gas Spent 24h",
      value: "0.014 ETH",
      delta: "Avg 21 Gwei",
      deltaTone: "text-secondary",
      progress: 42,
      barClass: "bg-accent-amber",
      sub: "Off-chain signature savings",
    },
    {
      label: "Network Health",
      value: "99.9%",
      delta: "MST Localnet 31337",
      deltaTone: "text-accent-green",
      progress: 99,
      barClass: "bg-accent-green",
      sub: "Block height synchronized",
    },
  ];

  // 30-day ETH volume trend line points
  const days = Array.from({ length: 31 }, (_, i) => i);
  const volumeData = days.map((d) => 12 + d * 2.8 + Math.sin(d / 3) * 6);
  const maxVol = 110;

  // Chart SVG dimensioning
  const width = 640;
  const height = 180;
  const paddingL = 35;
  const paddingR = 20;
  const paddingT = 15;
  const paddingB = 25;
  const chartW = width - paddingL - paddingR;
  const chartH = height - paddingT - paddingB;

  function toSvgCoords(d: number, v: number) {
    const x = paddingL + (d / 30) * chartW;
    const y = paddingT + chartH - (v / maxVol) * chartH;
    return { x, y };
  }

  const pathD = volumeData
    .map((v, d) => {
      const pt = toSvgCoords(d, v);
      return `${d === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    })
    .join(" ");

  const hoverX = paddingL + (hoverDay / 30) * chartW;
  const hoverVal = volumeData[hoverDay]?.toFixed(1) || "88.4";

  // Machine balance breakdown
  const machines = [
    {
      id: "M-042",
      role: "Autonomous Ground Robot",
      address: "0xcB00D7fF471334F2EeD249dF741C6E6c1B07aaf1",
      balance: "10.00 ETH",
      stake: "0.01 ETH",
      jobsCompleted: 14,
      status: "CONFIRMED",
      percent: 85,
    },
    {
      id: "M-018",
      role: "High-Speed Logistics Drone",
      address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      balance: "10.00 ETH",
      stake: "0.01 ETH",
      jobsCompleted: 9,
      status: "CONFIRMED",
      percent: 60,
    },
    {
      id: "M-089",
      role: "Heavy Payload Carrier",
      address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      balance: "5.20 ETH",
      stake: "0.01 ETH",
      jobsCompleted: 4,
      status: "PENDING",
      percent: 35,
    },
  ];

  return (
    <div className="space-y-6">
      {/* 6 Stat Tiles Grid (SENTINEL Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statTiles.map((tile, idx) => (
          <div key={idx} className="bg-card border border-border rounded-lg shadow-sm p-4 flex flex-col justify-between">
            <div>
              <span className="text-[11px] uppercase tracking-wide text-secondary font-mono font-medium">
                {tile.label}
              </span>
              <div className="text-2xl font-bold text-primary mt-1 tracking-tight">
                {tile.value}
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className={tile.deltaTone}>{tile.delta}</span>
                <span className="text-muted text-[10px]">{tile.sub}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-page overflow-hidden">
                <div
                  className={`h-full rounded-full ${tile.barClass}`}
                  style={{ width: `${tile.progress}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 2-Column Section: 30d Settlement Trajectory & Machine Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): 30-Day ETH Volume Settled Trend Chart */}
        <div className="lg:col-span-8 bg-card border border-border rounded-lg shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h3 className="text-sm font-bold text-primary tracking-wide">
                ETH Settlement Volume — 30-Day Trajectory
              </h3>
              <p className="text-xs text-secondary">
                Cumulative escrow liquidity settled across autonomous machine nodes.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="pill-confirmed text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                ● 100% On-Chain Finality
              </span>
            </div>
          </div>

          {/* Interactive Trajectory SVG Canvas */}
          <div className="relative pt-2 select-none">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-44 overflow-visible"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const relX = e.clientX - rect.left;
                const ratio = (relX - (paddingL / width) * rect.width) / ((chartW / width) * rect.width);
                const d = Math.max(0, Math.min(30, Math.round(ratio * 30)));
                setHoverDay(d);
              }}
            >
              {/* Horizontal grid lines */}
              {[0, 25, 50, 75, 100].map((val) => {
                const y = paddingT + chartH - (val / maxVol) * chartH;
                return (
                  <g key={val}>
                    <line x1={paddingL} y1={y} x2={paddingL + chartW} y2={y} stroke="#E5E7EB" strokeWidth="1" />
                    <text x={paddingL - 8} y={y + 3} textAnchor="end" fill="#9CA3AF" fontSize="9" fontFamily="monospace">
                      {val} ETH
                    </text>
                  </g>
                );
              })}

              {/* Day ticks */}
              {[0, 5, 10, 15, 20, 25, 30].map((d) => {
                const x = paddingL + (d / 30) * chartW;
                return (
                  <text key={d} x={x} y={height - 5} textAnchor="middle" fill="#9CA3AF" fontSize="9" fontFamily="monospace">
                    Day {d}
                  </text>
                );
              })}

              {/* Area under curve */}
              <path
                d={`${pathD} L ${paddingL + chartW} ${paddingT + chartH} L ${paddingL} ${paddingT + chartH} Z`}
                fill="#3B82F6"
                fillOpacity="0.08"
              />

              {/* Trajectory line */}
              <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth="2.5" />

              {/* Hover vertical rule */}
              <line
                x1={hoverX}
                y1={paddingT}
                x2={hoverX}
                y2={paddingT + chartH}
                stroke="#6B7280"
                strokeWidth="1"
                strokeDasharray="3 3"
              />

              {/* Hover dot */}
              <circle
                cx={hoverX}
                cy={toSvgCoords(hoverDay, volumeData[hoverDay] || 0).y}
                r="4.5"
                fill="#3B82F6"
                stroke="#FFFFFF"
                strokeWidth="2"
              />
            </svg>

            {/* Hover Tooltip */}
            <div
              className="absolute z-20 pointer-events-none p-2.5 rounded-lg bg-[#111827] text-white text-[11px] font-mono shadow-lg space-y-1"
              style={{
                left: Math.min(Math.max(hoverX - 45, 15), chartW - 75),
                top: 20,
              }}
            >
              <div className="font-bold border-b border-gray-700 pb-0.5 text-gray-300">Day {hoverDay}</div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-400">Volume:</span>
                <span className="font-bold text-accent-green">{hoverVal} ETH</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[10px] text-gray-400">
                <span>Avg Block:</span>
                <span>0.8s</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Per-Machine Outstanding Balance (Ward RI bars equivalent) */}
        <div className="lg:col-span-4 bg-card border border-border rounded-lg shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h3 className="text-sm font-bold text-primary tracking-wide">
                Machine Fleet Balances
              </h3>
              <p className="text-xs text-secondary">
                Outstanding stake & rewards per registered autonomous machine.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {machines.map((m) => (
              <div key={m.id} className="p-3 rounded-lg border border-border bg-[#FAFAFB] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold font-mono text-xs text-primary">{m.id}</span>
                    <span className="text-[11px] text-secondary font-mono">({m.role})</span>
                  </div>
                  <span
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      m.status === "CONFIRMED" ? "pill-confirmed" : "pill-pending"
                    }`}
                  >
                    {m.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-secondary text-[11px]">Wallet Balance:</span>
                  <span className="font-bold text-primary">{m.balance}</span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-muted">
                    <span>Stake: {m.stake}</span>
                    <span>{m.jobsCompleted} Jobs Verified</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent-blue"
                      style={{ width: `${m.percent}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-border flex items-center justify-between text-[11px] font-mono text-secondary">
            <span>Your Connected Balance:</span>
            <span className="font-bold text-primary">{clientBalance} ETH</span>
          </div>
        </div>
      </div>
    </div>
  );
}
