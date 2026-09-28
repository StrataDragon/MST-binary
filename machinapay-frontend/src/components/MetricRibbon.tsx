import React from "react";
import { Lock, ShieldCheck, Cpu, Zap } from "lucide-react";
import { cfg } from "../lib/config";

interface MetricRibbonProps {
  tvl: string;
  totalJobs: number;
  activeJobs: number;
  paidJobs: number;
}

export function MetricRibbon({ tvl, totalJobs, activeJobs, paidJobs }: MetricRibbonProps) {
  const cards = [
    {
      title: "Escrow Locked Value",
      value: `${tvl} ${cfg.nativeToken}`,
      sub: `${activeJobs} Active Locked Contracts`,
      percent: 98,
      accentColor: "#5ee6a8", // ok (emerald)
      icon: Lock,
      barClass: "bg-ok",
    },
    {
      title: "Verification Fidelity",
      value: "100%",
      sub: "EIP-712 Dual-Signed Attestation",
      percent: 100,
      accentColor: "#ffb02e", // signal (amber)
      icon: ShieldCheck,
      barClass: "bg-signal",
    },
    {
      title: "Autonomous Fleet",
      value: "M-042 Ready",
      sub: "Staked 0.01 MST · Active Enclave",
      percent: 95,
      accentColor: "#5ee6a8", // ok (emerald)
      icon: Cpu,
      barClass: "bg-ok",
    },
    {
      title: "Settlement Finality",
      value: "< 1.2s",
      sub: "MST Fast Ledger Block Confirmation",
      percent: 98,
      accentColor: "#ffb02e", // signal (amber)
      icon: Zap,
      barClass: "bg-signal",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="rounded-xl border border-line bg-panel p-4 relative overflow-hidden transition-all hover:border-signal/50"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[11px] font-mono text-dim uppercase tracking-wider">
                  {card.title}
                </p>
                <div className="text-xl font-bold font-mono tracking-tight text-white mt-1">
                  {card.value}
                </div>
              </div>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-line bg-ink"
                style={{ color: card.accentColor }}
              >
                <Icon className="w-4 h-4" />
              </div>
            </div>

            {/* Subtitle & Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-dim font-mono">
                <span>{card.sub}</span>
                <span className="font-semibold text-white/90">{card.percent}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-ink overflow-hidden border border-line/40">
                <div
                  className={`h-full rounded-full ${card.barClass}`}
                  style={{ width: `${card.percent}%` }}
                />
              </div>
            </div>

            {/* Bottom accent colored line */}
            <div
              className="absolute bottom-0 left-0 right-0 h-[2px]"
              style={{ backgroundColor: card.accentColor }}
            />
          </div>
        );
      })}
    </div>
  );
}
