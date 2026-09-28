import React from "react";
import { Bot, Cpu, CheckCircle2, ArrowRight, ShieldCheck, Zap, Layers, Lock, Award, DollarSign } from "lucide-react";

export interface MachineListing {
  id: string;
  name: string;
  type: string;
  capability: string;
  jobDescription: string;
  jobType: "PACKAGE_TRANSPORT" | "COLOR_SORTING";
  status: "available" | "busy" | "maintenance";
  reputation: number;
  completedJobs: number;
  basePriceMst: number;
  highlightFactor: string;
  tags: string[];
}

export const PRIMARY_MACHINES: MachineListing[] = [
  {
    id: "M-042",
    name: "Autonomous Transport Robot",
    type: "Ground Logistics AMR",
    capability: "Package Transportation",
    jobDescription: "Move package from Point A to Point B",
    jobType: "PACKAGE_TRANSPORT",
    status: "available",
    reputation: 96,
    completedJobs: 127,
    basePriceMst: 30,
    highlightFactor: "Distance & Weight Dependent",
    tags: ["Autonomous", "EIP-712 Proof", "GPS Telemetry", "Dynamic Pricing"],
  },
  {
    id: "M-051",
    name: "Robotic Pick-and-Place Arm",
    type: "High-Precision 6-Axis Manipulator",
    capability: "Pick-and-Place Color Sorting",
    jobDescription: "Pick objects and sort them into different color bins",
    jobType: "COLOR_SORTING",
    status: "available",
    reputation: 94,
    completedJobs: 86,
    basePriceMst: 20,
    highlightFactor: "Color Complexity & Accuracy Dependent",
    tags: ["Optical Sensor", "Multi-Bin Sorting", "Telemetry Proof", "Dynamic Pricing"],
  },
];

interface MarketplaceViewProps {
  onHireTransport: () => void;
  onHireColorSorting: () => void;
  onOpenPricingDashboard: () => void;
}

export function MarketplaceView({
  onHireTransport,
  onHireColorSorting,
  onOpenPricingDashboard,
}: MarketplaceViewProps) {
  return (
    <div className="space-y-8 animate-fade-in font-mono">
      {/* 1. Header Banner & Core Pitch */}
      <div className="rounded-xl border border-[#1E1E24] bg-[#0B0B0E] p-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-blue/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-accent-blue/10 border border-accent-blue/30 text-accent-blue text-xs font-semibold">
              <Zap className="w-3.5 h-3.5" />
              <span>MachinaPay Autonomous Machine Marketplace</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              One Programmable Commerce Layer for Any Machine
            </h1>
            <p className="text-xs md:text-sm text-[#9CA3AF] leading-relaxed">
              MachinaPay is not built for one robot. From autonomous transport robots to 6-axis sorting arms,
              different machines execute different jobs with transparent dynamic pricing, on-chain escrow,
              cryptographic EIP-712 proof, and automated settlement.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onOpenPricingDashboard}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[#1E1E24] bg-white/5 hover:bg-white/10 text-white text-xs font-semibold transition-colors"
            >
              <DollarSign className="w-4 h-4 text-accent-green" />
              <span>Pricing Economics</span>
            </button>
          </div>
        </div>

        {/* Life-cycle flow strip */}
        <div className="mt-6 pt-5 border-t border-[#1E1E24] flex items-center justify-between text-[11px] text-[#9CA3AF] overflow-x-auto gap-2">
          <span className="text-white font-semibold flex-shrink-0">IDENTITY</span>
          <span className="text-[#4B5563]">→</span>
          <span className="text-accent-blue font-semibold flex-shrink-0">DYNAMIC PRICING</span>
          <span className="text-[#4B5563]">→</span>
          <span className="text-white font-semibold flex-shrink-0">PRICE LOCK</span>
          <span className="text-[#4B5563]">→</span>
          <span className="text-accent-green font-semibold flex-shrink-0">ESCROW</span>
          <span className="text-[#4B5563]">→</span>
          <span className="text-white font-semibold flex-shrink-0">EXECUTION</span>
          <span className="text-[#4B5563]">→</span>
          <span className="text-white font-semibold flex-shrink-0">EIP-712 PROOF</span>
          <span className="text-[#4B5563]">→</span>
          <span className="text-accent-blue font-semibold flex-shrink-0">VERIFICATION</span>
          <span className="text-[#4B5563]">→</span>
          <span className="text-accent-green font-semibold flex-shrink-0">PAY / REFUND</span>
          <span className="text-[#4B5563]">→</span>
          <span className="text-white font-semibold flex-shrink-0">REPUTATION</span>
        </div>
      </div>

      {/* 2. Primary Machines Grid (Exactly 2 Machines) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Primary Autonomous Fleet (Hackathon Demo)
            </h2>
            <p className="text-xs text-[#9CA3AF]">
              Live machines registered on-chain with staked collateral and hardware signing identities
            </p>
          </div>
          <div className="text-xs text-[#9CA3AF]">
            2 Active Hardware Nodes
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* MACHINE 1: M-042 */}
          <div className="rounded-xl border border-[#1E1E24] bg-[#0B0B0E] p-6 flex flex-col justify-between hover:border-accent-blue/50 transition-all group shadow-sm">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-accent-blue/10 border border-accent-blue/30 flex items-center justify-center text-accent-blue">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white tracking-wide">M-042</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Available
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white group-hover:text-accent-blue transition-colors">
                      Autonomous Transport Robot
                    </h3>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#9CA3AF]">Reputation</div>
                  <div className="text-lg font-bold text-white flex items-center gap-1 justify-end">
                    <Award className="w-4 h-4 text-amber-400" />
                    <span>96</span>
                    <span className="text-xs text-[#6B7280]">/100</span>
                  </div>
                </div>
              </div>

              {/* Capability & Details */}
              <div className="p-3 rounded-lg bg-[#141419] border border-[#1E1E24] space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#9CA3AF]">Capability:</span>
                  <span className="text-white font-medium">Package Transportation</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9CA3AF]">Job Type:</span>
                  <span className="text-accent-blue font-semibold">PACKAGE_TRANSPORT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9CA3AF]">Mission:</span>
                  <span className="text-[#E5E7EB]">Move package from Point A → Point B</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9CA3AF]">Dynamic Pricing:</span>
                  <span className="text-accent-green font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Active (Distance + Weight + Surge)
                  </span>
                </div>
              </div>

              {/* Pricing breakdown summary */}
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-xs space-y-1">
                <div className="flex justify-between font-semibold text-white">
                  <span>Benchmark Quote (5 km, 10 kg, Priority):</span>
                  <span className="text-accent-green">86 MST</span>
                </div>
                <div className="text-[11px] text-[#9CA3AF]">
                  Formula: Base 30 + 15 (km) + 10 (kg) + 10 (prio) + 11 (demand) + 10 (avail)
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {PRIMARY_MACHINES[0].tags.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded bg-[#18181F] text-[#9CA3AF] text-[10px] border border-[#262630]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-[#1E1E24] flex items-center justify-between">
              <div className="text-xs text-[#9CA3AF]">
                <span className="text-white font-semibold">127</span> jobs completed
              </div>
              <button
                onClick={onHireTransport}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent-blue hover:bg-blue-600 text-white text-xs font-bold transition-all shadow-sm group-hover:shadow-accent-blue/20"
              >
                <span>HIRE MACHINE</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* MACHINE 2: M-051 */}
          <div className="rounded-xl border border-[#1E1E24] bg-[#0B0B0E] p-6 flex flex-col justify-between hover:border-accent-green/50 transition-all group shadow-sm">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-accent-green">
                    <Cpu className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white tracking-wide">M-051</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Available
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white group-hover:text-accent-green transition-colors">
                      Robotic Pick-and-Place Arm
                    </h3>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#9CA3AF]">Reputation</div>
                  <div className="text-lg font-bold text-white flex items-center gap-1 justify-end">
                    <Award className="w-4 h-4 text-amber-400" />
                    <span>94</span>
                    <span className="text-xs text-[#6B7280]">/100</span>
                  </div>
                </div>
              </div>

              {/* Capability & Details */}
              <div className="p-3 rounded-lg bg-[#141419] border border-[#1E1E24] space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#9CA3AF]">Capability:</span>
                  <span className="text-white font-medium">Pick-and-Place Color Sorting</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9CA3AF]">Job Type:</span>
                  <span className="text-accent-green font-semibold">COLOR_SORTING</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9CA3AF]">Mission:</span>
                  <span className="text-[#E5E7EB]">Sort objects into Red, Blue, Green, Yellow bins</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9CA3AF]">Dynamic Pricing:</span>
                  <span className="text-accent-green font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Active (Objects + Colors + Accuracy)
                  </span>
                </div>
              </div>

              {/* Pricing breakdown summary */}
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-xs space-y-1">
                <div className="flex justify-between font-semibold text-white">
                  <span>Benchmark Quote (100 objs, 4 colors, 95% acc):</span>
                  <span className="text-accent-green">80 MST</span>
                </div>
                <div className="text-[11px] text-[#9CA3AF]">
                  Formula: Base 20 + 20 (objs) + 8 (colors) + 5 (acc) + 10 (prio) + 12 (demand) + 5 (avail)
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {PRIMARY_MACHINES[1].tags.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded bg-[#18181F] text-[#9CA3AF] text-[10px] border border-[#262630]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-[#1E1E24] flex items-center justify-between">
              <div className="text-xs text-[#9CA3AF]">
                <span className="text-white font-semibold">86</span> jobs completed
              </div>
              <button
                onClick={onHireColorSorting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent-green hover:bg-emerald-600 text-black text-xs font-bold transition-all shadow-sm group-hover:shadow-accent-green/20"
              >
                <span>HIRE MACHINE</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Core Architecture Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <div className="rounded-lg border border-[#1E1E24] bg-[#0B0B0E] p-4 space-y-2">
          <div className="flex items-center gap-2 text-accent-blue font-bold text-xs">
            <Lock className="w-4 h-4" />
            <span>Price Lock Immutability</span>
          </div>
          <p className="text-xs text-[#9CA3AF] leading-relaxed">
            Dynamic pricing only determines the quote for <em>new</em> jobs. Once the customer confirms,
            the price is locked in escrow. Market surges cannot alter funded jobs.
          </p>
        </div>

        <div className="rounded-lg border border-[#1E1E24] bg-[#0B0B0E] p-4 space-y-2">
          <div className="flex items-center gap-2 text-accent-green font-bold text-xs">
            <ShieldCheck className="w-4 h-4" />
            <span>Shared Escrow Infrastructure</span>
          </div>
          <p className="text-xs text-[#9CA3AF] leading-relaxed">
            Both M-042 (Transport) and M-051 (Robotic Arm) settle via the same battle-tested <span className="text-white font-semibold">JobEscrow.sol</span> and <span className="text-white font-semibold">MachineRegistry.sol</span> contracts.
          </p>
        </div>

        <div className="rounded-lg border border-[#1E1E24] bg-[#0B0B0E] p-4 space-y-2">
          <div className="flex items-center gap-2 text-white font-bold text-xs">
            <Layers className="w-4 h-4" />
            <span>Multi-Verifier Consensus</span>
          </div>
          <p className="text-xs text-[#9CA3AF] leading-relaxed">
            Independent simulated verifiers evaluate physical sensor telemetry, EIP-712 signatures, and compliance. Payment releases automatically upon 2/3 quorum.
          </p>
        </div>
      </div>
    </div>
  );
}
