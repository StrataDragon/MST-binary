import React, { useState } from "react";
import {
  DollarSign,
  Lock,
  ArrowRight,
  Calculator,
  ShieldCheck,
  CheckCircle2,
  Info,
  Layers,
  Sparkles,
  Bot,
  Cpu,
} from "lucide-react";
import {
  calculateTransportPrice,
  calculateColorSortingPrice,
  JobPriceCalculation,
} from "../lib/pricingEngine";

export function DynamicPricingDashboard() {
  // Transport live calculator
  const [tDistance, setTDistance] = useState(5);
  const [tWeight, setTWeight] = useState(10);
  const [tUrgency, setTUrgency] = useState<"STANDARD" | "PRIORITY" | "URGENT">("PRIORITY");
  const [tDemand, setTDemand] = useState<"LOW" | "MEDIUM" | "HIGH">("HIGH");
  const [tAvail, setTAvail] = useState<"HIGH" | "MEDIUM" | "LOW">("LOW");

  // Color sorting live calculator
  const [cObjects, setCObjects] = useState(100);
  const [cColors, setCColors] = useState<string[]>(["RED", "BLUE", "GREEN", "YELLOW"]);
  const [cAccuracy, setCAccuracy] = useState(95);
  const [cUrgency, setCUrgency] = useState<"STANDARD" | "PRIORITY" | "URGENT">("PRIORITY");
  const [cDemand, setCDemand] = useState<"LOW" | "MEDIUM" | "HIGH">("HIGH");
  const [cAvail, setCAvail] = useState<"HIGH" | "MEDIUM" | "LOW">("LOW");

  const transportCalc: JobPriceCalculation = calculateTransportPrice({
    distanceKm: tDistance,
    weightKg: tWeight,
    urgency: tUrgency,
    demand: tDemand,
    availability: tAvail,
  });

  const colorCalc: JobPriceCalculation = calculateColorSortingPrice({
    objectCount: cObjects,
    colors: cColors,
    requiredAccuracyPercent: cAccuracy,
    urgency: cUrgency,
    demand: cDemand,
    availability: cAvail,
  });

  return (
    <div className="space-y-8 font-mono animate-fade-in">
      {/* 1. Platform-Level Header Banner */}
      <div className="rounded-xl border border-[#1E1E24] bg-[#0B0B0E] p-6 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-accent-green/10 border border-accent-green/30 text-accent-green text-xs font-semibold">
              <DollarSign className="w-3.5 h-3.5" />
              <span>Platform-Level Pricing Service</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Dynamic Pricing Engine
            </h1>
            <p className="text-xs md:text-sm text-[#9CA3AF] leading-relaxed">
              MachinaPay dynamically prices different machine jobs according to their real-world economics.
              Deterministic, transparent, and locked into escrow before job dispatch.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#141419] border border-[#1E1E24] space-y-1 text-right">
            <div className="text-[10px] text-[#9CA3AF] uppercase">Guaranteed Determinism</div>
            <div className="text-lg font-bold text-white flex items-center gap-1.5 justify-end">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span>Zero Randomness</span>
            </div>
            <div className="text-[11px] text-accent-green">Audit-Verified Quotes</div>
          </div>
        </div>
      </div>

      {/* 2. Side-By-Side Benchmark Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* TRANSPORT BENCHMARK */}
        <div className="rounded-xl border border-[#1E1E24] bg-[#0B0B0E] p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E1E24] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-accent-blue/10 border border-accent-blue/30 flex items-center justify-center text-accent-blue">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">M-042 Transport Robot</div>
                  <div className="text-[10px] text-accent-blue">PACKAGE_TRANSPORT</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-[#9CA3AF]">Current Quote</div>
                <div className="text-xl font-bold text-accent-green">{transportCalc.finalPrice} MST</div>
              </div>
            </div>

            {/* Why prices differ */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white">
                Transport Economic Drivers:
              </div>
              <div className="p-3 rounded-lg bg-[#141419] border border-[#1E1E24] space-y-1.5 text-xs text-[#9CA3AF]">
                <div className="flex justify-between">
                  <span>• Distance:</span>
                  <span className="text-white font-medium">{tDistance} km (3 MST/km)</span>
                </div>
                <div className="flex justify-between">
                  <span>• Payload Weight:</span>
                  <span className="text-white font-medium">{tWeight} kg (1 MST/kg)</span>
                </div>
                <div className="flex justify-between">
                  <span>• Urgency:</span>
                  <span className="text-white font-medium">{tUrgency}</span>
                </div>
                <div className="flex justify-between">
                  <span>• Regional Demand:</span>
                  <span className="text-amber-400 font-medium">{tDemand} (+15% surge)</span>
                </div>
                <div className="flex justify-between">
                  <span>• Fleet Availability:</span>
                  <span className="text-purple-300 font-medium">{tAvail} (+10 MST)</span>
                </div>
              </div>
            </div>

            {/* Factor breakdown */}
            <div className="space-y-1.5 text-xs">
              <div className="text-[11px] font-semibold text-white">Factor Breakdown</div>
              <div className="p-3 rounded-lg bg-black/40 border border-[#1E1E24] space-y-1 text-[#9CA3AF]">
                {transportCalc.factors.map((f, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{f.name}</span>
                    <span className="text-white font-medium">+{f.costMst} MST</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#1E1E24] flex items-center justify-between text-xs">
            <span className="text-[#9CA3AF]">Locked into Escrow:</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
              <Lock className="w-3 h-3" /> {transportCalc.finalPrice} MST LOCKED
            </span>
          </div>
        </div>

        {/* COLOR SORTING BENCHMARK */}
        <div className="rounded-xl border border-[#1E1E24] bg-[#0B0B0E] p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E1E24] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-accent-green">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">M-051 Robotic Arm</div>
                  <div className="text-[10px] text-accent-green">COLOR_SORTING</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-[#9CA3AF]">Current Quote</div>
                <div className="text-xl font-bold text-accent-green">{colorCalc.finalPrice} MST</div>
              </div>
            </div>

            {/* Why prices differ */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white">
                Color Sorting Economic Drivers:
              </div>
              <div className="p-3 rounded-lg bg-[#141419] border border-[#1E1E24] space-y-1.5 text-xs text-[#9CA3AF]">
                <div className="flex justify-between">
                  <span>• Object Count:</span>
                  <span className="text-white font-medium">{cObjects} units (0.20 MST/unit)</span>
                </div>
                <div className="flex justify-between">
                  <span>• Color Complexity:</span>
                  <span className="text-white font-medium">4 bins (Red, Blue, Green, Yellow)</span>
                </div>
                <div className="flex justify-between">
                  <span>• Optical Accuracy:</span>
                  <span className="text-white font-medium">≥{cAccuracy}% threshold (+5 MST)</span>
                </div>
                <div className="flex justify-between">
                  <span>• Cell Queue Demand:</span>
                  <span className="text-amber-400 font-medium">{cDemand} (+12 MST peak)</span>
                </div>
                <div className="flex justify-between">
                  <span>• Arm Availability:</span>
                  <span className="text-purple-300 font-medium">{cAvail} (+5 MST tight cycle)</span>
                </div>
              </div>
            </div>

            {/* Factor breakdown */}
            <div className="space-y-1.5 text-xs">
              <div className="text-[11px] font-semibold text-white">Factor Breakdown</div>
              <div className="p-3 rounded-lg bg-black/40 border border-[#1E1E24] space-y-1 text-[#9CA3AF]">
                {colorCalc.factors.map((f, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{f.name}</span>
                    <span className="text-white font-medium">+{f.costMst} MST</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#1E1E24] flex items-center justify-between text-xs">
            <span className="text-[#9CA3AF]">Locked into Escrow:</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
              <Lock className="w-3 h-3" /> {colorCalc.finalPrice} MST LOCKED
            </span>
          </div>
        </div>
      </div>

      {/* 3. Deep-Dive Matrix: Why Prices Differ */}
      <div className="rounded-xl border border-[#1E1E24] bg-[#0B0B0E] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-accent-blue" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Architecture Matrix: Why Prices Differ
          </h2>
        </div>
        <p className="text-xs text-[#9CA3AF] leading-relaxed">
          MachinaPay avoids simplistic, one-size-fits-all fixed rates. Different machines face distinct physical bottlenecks and operational costs:
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-[#1E1E24] text-[#9CA3AF]">
                <th className="py-2.5 px-3">Pricing Dimension</th>
                <th className="py-2.5 px-3 text-accent-blue">Transport Robot (M-042)</th>
                <th className="py-2.5 px-3 text-accent-green">Color Sorting Arm (M-051)</th>
                <th className="py-2.5 px-3">Economic Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E1E24] text-[#E5E7EB]">
              <tr>
                <td className="py-2.5 px-3 font-semibold text-white">Base Price</td>
                <td className="py-2.5 px-3 text-accent-blue">30 MST</td>
                <td className="py-2.5 px-3 text-accent-green">20 MST</td>
                <td className="py-2.5 px-3 text-[#9CA3AF]">Mobility requires higher ground readiness vs stationary station setup</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-white">Primary Variable</td>
                <td className="py-2.5 px-3 text-accent-blue">Distance (3 MST/km)</td>
                <td className="py-2.5 px-3 text-accent-green">Object Units (0.20 MST/object)</td>
                <td className="py-2.5 px-3 text-[#9CA3AF]">AMR power scales with battery & km; arm wear scales with pick cycles</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-white">Secondary Variable</td>
                <td className="py-2.5 px-3 text-accent-blue">Payload Weight (1 MST/kg)</td>
                <td className="py-2.5 px-3 text-accent-green">Color Complexity (2 MST/color)</td>
                <td className="py-2.5 px-3 text-[#9CA3AF]">Heavy loads increase motor torque; extra bins widen arm arc angle</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-white">Quality Threshold</td>
                <td className="py-2.5 px-3 text-accent-blue">Delivery Verification</td>
                <td className="py-2.5 px-3 text-accent-green">Optical Accuracy SLA (+5 MST)</td>
                <td className="py-2.5 px-3 text-[#9CA3AF]">Sorting requires tight optical classification accuracy (&ge;95%)</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-white">Common Market Surcharges</td>
                <td className="py-2.5 px-3 text-accent-blue">Demand (+15%) / Avail (+10 MST)</td>
                <td className="py-2.5 px-3 text-accent-green">Demand (+12 MST) / Avail (+5 MST)</td>
                <td className="py-2.5 px-3 text-[#9CA3AF]">Shared platform-level surge rules adjust according to live conditions</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
