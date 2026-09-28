import React, { useState, useEffect } from "react";
import {
  DollarSign,
  Lock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Info,
  Layers,
  Bot,
  Cpu,
  Search,
  AlertCircle
} from "lucide-react";
import {
  quoteTransport,
  quoteSorting,
  TRANSPORT_BASE_PRICE,
  TRANSPORT_KM_RATE,
  TRANSPORT_KG_RATE,
  SORTING_BASE_PRICE,
  SORTING_PER_OBJECT_RATE,
  SORTING_PER_COLOR_RATE,
  SORTING_ACCURACY_THRESHOLD,
  SORTING_ACCURACY_SURCHARGE,
  URGENCY_PRIORITY_FEE,
  URGENCY_URGENT_FEE,
  QuoteResult,
} from "../lib/pricing";
import { NATIVE_SYMBOL, getContractConfig } from "../lib/config";
import { ethers } from "ethers";

export function DynamicPricingDashboard() {
  // Transport live calculator inputs
  const [tDistance, setTDistance] = useState<number>(5);
  const [tWeight, setTWeight] = useState<number>(10);
  const [tUrgency, setTUrgency] = useState<"STANDARD" | "PRIORITY" | "URGENT">("PRIORITY");

  // Color sorting live calculator inputs
  const [cObjects, setCObjects] = useState<number>(100);
  const [cColorCount, setCColorCount] = useState<number>(4);
  const [cAccuracy, setCAccuracy] = useState<number>(95);
  const [cUrgency, setCUrgency] = useState<"STANDARD" | "PRIORITY" | "URGENT">("PRIORITY");

  // On-chain stats
  const [openJobsCount, setOpenJobsCount] = useState<number>(0);
  const [totalLockedOnChain, setTotalLockedOnChain] = useState<string>("0");
  const [activeTransportMachines, setActiveTransportMachines] = useState<number>(1);
  const [activeSortingMachines, setActiveSortingMachines] = useState<number>(1);
  const [loadingChain, setLoadingChain] = useState<boolean>(true);

  // Job ID lookup for real locked check
  const [searchJobId, setSearchJobId] = useState<string>("");
  const [searchedJob, setSearchedJob] = useState<{ id: string; reward: string; state: string } | null>(null);
  const [searchError, setSearchError] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function loadChainData() {
      try {
        const cfg = getContractConfig();
        const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
        const escrow = new ethers.Contract(cfg.escrowAddress, cfg.escrowAbi, provider);
        const registry = new ethers.Contract(cfg.registryAddress, cfg.registryAbi, provider);

        // 1. Total locked
        try {
          const locked = await escrow.totalLocked();
          if (mounted) setTotalLockedOnChain(ethers.formatEther(locked));
        } catch (e) {
          console.warn("Could not fetch totalLocked:", e);
        }

        // 2. Count funded open jobs from events
        try {
          const fundedFilter = escrow.filters.JobFunded();
          const releasedFilter = escrow.filters.PaymentReleased();
          const refundedFilter = escrow.filters.JobRefunded();

          const [fundedLogs, releasedLogs, refundedLogs] = await Promise.all([
            escrow.queryFilter(fundedFilter, -1000).catch(() => []),
            escrow.queryFilter(releasedFilter, -1000).catch(() => []),
            escrow.queryFilter(refundedFilter, -1000).catch(() => []),
          ]);

          const settledIds = new Set<string>();
          for (const l of [...releasedLogs, ...refundedLogs]) {
            if ("args" in l && (l as any).args && (l as any).args[0]) {
              settledIds.add(String((l as any).args[0]));
            }
          }

          let open = 0;
          for (const l of fundedLogs) {
            if ("args" in l && (l as any).args && (l as any).args[0]) {
              if (!settledIds.has(String((l as any).args[0]))) open++;
            }
          }
          if (mounted) setOpenJobsCount(open);
        } catch (e) {
          console.warn("Could not compute open jobs:", e);
        }

        // 3. Count machines
        try {
          const ids = await registry.getMachineIds();
          let transportCount = 0;
          let sortingCount = 0;
          for (const id of ids) {
            const m = await registry.getMachine(id);
            if (m.active) {
              const strId = ethers.decodeBytes32String(id);
              if (strId.includes("051") || strId.toLowerCase().includes("arm") || strId.toLowerCase().includes("sort")) {
                sortingCount++;
              } else {
                transportCount++;
              }
            }
          }
          if (mounted) {
            setActiveTransportMachines(Math.max(1, transportCount));
            setActiveSortingMachines(Math.max(1, sortingCount));
          }
        } catch (e) {
          console.warn("Could not get machine stats:", e);
        }
      } catch (err) {
        console.error("Pricing chain load error:", err);
      } finally {
        if (mounted) setLoadingChain(false);
      }
    }

    loadChainData();
    return () => {
      mounted = false;
    };
  }, []);

  const handleLookupJob = async () => {
    if (!searchJobId.trim()) return;
    setSearchError("");
    setSearchedJob(null);
    try {
      const cfg = getContractConfig();
      const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
      const escrow = new ethers.Contract(cfg.escrowAddress, cfg.escrowAbi, provider);
      const bytesId = ethers.encodeBytes32String(searchJobId.trim());
      const job = await escrow.getJob(bytesId);

      const stateMap = ["CREATED", "FUNDED", "ACCEPTED", "EXECUTING", "PROOF_SUBMITTED", "RELEASED", "REFUNDED"];
      setSearchedJob({
        id: searchJobId.trim(),
        reward: ethers.formatEther(job.reward),
        state: stateMap[Number(job.state)] || `STATE_${job.state}`,
      });
    } catch (err: any) {
      setSearchError("Job not found on-chain or invalid ID.");
    }
  };

  // Quotes recalculate dynamically from pricing.ts pure functions
  const transportQuote: QuoteResult = quoteTransport({
    distanceKm: tDistance,
    weightKg: tWeight,
    urgency: tUrgency,
    openJobsCount: openJobsCount,
    availableMachinesCount: activeTransportMachines,
  });

  const sortingQuote: QuoteResult = quoteSorting({
    objectCount: cObjects,
    colorCount: cColorCount,
    accuracyThreshold: cAccuracy,
    urgency: cUrgency,
    openJobsCount: openJobsCount,
    availableMachinesCount: activeSortingMachines,
  });

  return (
    <div className="space-y-6 font-sans">
      {/* 1. Platform Header Banner (Light Card with soft blue/green tint, dark heading, 2 lines text max) */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-xs font-semibold">
              <DollarSign className="w-3.5 h-3.5" />
              <span>Frontend Pricing Engine</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Dynamic Pricing Engine
            </h1>
            <p className="text-sm text-gray-700 leading-snug">
              The smart contracts contain no pricing logic. Quotes are computed deterministically in the client and deposited directly as msg.value into JobEscrow.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-white border border-gray-200 shadow-sm text-right shrink-0">
            <div className="text-[11px] text-gray-500 uppercase font-semibold">Escrow Total Locked</div>
            <div className="text-lg font-bold text-gray-900 font-mono flex items-center justify-end gap-1.5">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span>{loadingChain ? "..." : `${totalLockedOnChain} ${NATIVE_SYMBOL}`}</span>
            </div>
            <div className="text-[11px] text-emerald-700 font-medium">Live on-chain balance</div>
          </div>
        </div>
      </div>

      {/* 2. Side-By-Side Interactive Quotes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* TRANSPORT CALCULATOR */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5 flex flex-col justify-between shadow-sm">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">Transport Machine Quote</div>
                  <div className="text-xs font-mono text-blue-600">PACKAGE_TRANSPORT (M-042)</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-gray-500">Live Quote</div>
                <div className="text-xl font-bold text-emerald-600 font-mono">
                  {transportQuote.total.toFixed(2)} {NATIVE_SYMBOL}
                </div>
              </div>
            </div>

            {/* Inputs */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Transport Inputs:
              </div>
              <div className="p-4 rounded-lg bg-[#f6f7f9] border border-gray-200 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <label className="text-gray-700 font-medium">Distance (km):</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={tDistance}
                      onChange={(e) => setTDistance(Number(e.target.value))}
                      className="w-28 accent-blue-600"
                    />
                    <span className="w-12 text-right font-mono font-bold text-gray-900">{tDistance} km</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-gray-700 font-medium">Payload Weight (kg):</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={tWeight}
                      onChange={(e) => setTWeight(Number(e.target.value))}
                      className="w-28 accent-blue-600"
                    />
                    <span className="w-12 text-right font-mono font-bold text-gray-900">{tWeight} kg</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-gray-700 font-medium">Urgency:</label>
                  <div className="flex gap-1.5">
                    {(["STANDARD", "PRIORITY", "URGENT"] as const).map((urg) => (
                      <button
                        key={urg}
                        type="button"
                        onClick={() => setTUrgency(urg)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                          tUrgency === urg
                            ? "bg-blue-600 text-white"
                            : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {urg}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Factor breakdown */}
            <div className="space-y-1.5 text-xs">
              <div className="text-xs font-semibold text-gray-700">Factor Breakdown</div>
              <div className="p-3.5 rounded-lg bg-[#f6f7f9] border border-gray-200 space-y-1.5 text-gray-600">
                {transportQuote.factors.map((f, i) => (
                  <div key={i} className="flex justify-between items-center text-xs">
                    <span>{f.label}</span>
                    <span className="font-mono font-semibold text-gray-900">
                      +{f.amount.toFixed(2)} {NATIVE_SYMBOL}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="text-gray-500">Escrow Status:</span>
            <span className="px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>Not locked yet (Hypothetical Quote)</span>
            </span>
          </div>
        </div>

        {/* COLOR SORTING CALCULATOR */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5 flex flex-col justify-between shadow-sm">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">Color Sorting Machine Quote</div>
                  <div className="text-xs font-mono text-emerald-600">COLOR_SORTING (M-051)</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-gray-500">Live Quote</div>
                <div className="text-xl font-bold text-emerald-600 font-mono">
                  {sortingQuote.total.toFixed(2)} {NATIVE_SYMBOL}
                </div>
              </div>
            </div>

            {/* Inputs */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Sorting Inputs:
              </div>
              <div className="p-4 rounded-lg bg-[#f6f7f9] border border-gray-200 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <label className="text-gray-700 font-medium">Object Count:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="10"
                      max="500"
                      step="10"
                      value={cObjects}
                      onChange={(e) => setCObjects(Number(e.target.value))}
                      className="w-28 accent-emerald-600"
                    />
                    <span className="w-12 text-right font-mono font-bold text-gray-900">{cObjects}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-gray-700 font-medium">Colour Bins:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="2"
                      max="8"
                      value={cColorCount}
                      onChange={(e) => setCColorCount(Number(e.target.value))}
                      className="w-28 accent-emerald-600"
                    />
                    <span className="w-12 text-right font-mono font-bold text-gray-900">{cColorCount} bins</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-gray-700 font-medium">Accuracy Threshold (%):</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="80"
                      max="99"
                      value={cAccuracy}
                      onChange={(e) => setCAccuracy(Number(e.target.value))}
                      className="w-28 accent-emerald-600"
                    />
                    <span className="w-12 text-right font-mono font-bold text-gray-900">{cAccuracy}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-gray-700 font-medium">Urgency:</label>
                  <div className="flex gap-1.5">
                    {(["STANDARD", "PRIORITY", "URGENT"] as const).map((urg) => (
                      <button
                        key={urg}
                        type="button"
                        onClick={() => setCUrgency(urg)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                          cUrgency === urg
                            ? "bg-emerald-600 text-white"
                            : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {urg}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Factor breakdown */}
            <div className="space-y-1.5 text-xs">
              <div className="text-xs font-semibold text-gray-700">Factor Breakdown</div>
              <div className="p-3.5 rounded-lg bg-[#f6f7f9] border border-gray-200 space-y-1.5 text-gray-600">
                {sortingQuote.factors.map((f, i) => (
                  <div key={i} className="flex justify-between items-center text-xs">
                    <span>{f.label}</span>
                    <span className="font-mono font-semibold text-gray-900">
                      +{f.amount.toFixed(2)} {NATIVE_SYMBOL}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="text-gray-500">Escrow Status:</span>
            <span className="px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>Not locked yet (Hypothetical Quote)</span>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Escrow Job Verification Lookup */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-600" />
          <h2 className="text-sm font-bold text-gray-900">
            Verify Real Job Escrow Lock
          </h2>
        </div>
        <p className="text-xs text-gray-600">
          Enter a real Job ID to inspect its locked escrow amount from the blockchain contract.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
          <input
            type="text"
            placeholder="e.g. JOB-1234 or job ID"
            value={searchJobId}
            onChange={(e) => setSearchJobId(e.target.value)}
            className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg font-mono focus:outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={handleLookupJob}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Check Escrow
          </button>
        </div>

        {searchError && (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <AlertCircle className="w-4 h-4" />
            <span>{searchError}</span>
          </div>
        )}

        {searchedJob && (
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-bold text-emerald-950 font-mono">Job: {searchedJob.id}</div>
              <div className="text-emerald-800">State: <span className="font-semibold">{searchedJob.state}</span></div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 shadow-xs">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span className="font-mono font-bold text-emerald-900 text-sm">
                {searchedJob.reward} {NATIVE_SYMBOL} LOCKED IN ESCROW
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 4. Protocol Facts & Guarantees */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-1.5 shadow-sm">
          <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Verifier attestation</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            One trusted verifier signs the cryptographic execution verdict and the JobEscrow smart contract strictly enforces it.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-1.5 shadow-sm">
          <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Deterministic quotes</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Same inputs yield the exact same price. Calculated via pure client-side pricing algorithms before creating the job.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-1.5 shadow-sm">
          <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-purple-600" />
            <span>Reward fixed at createJob</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            The job reward is fixed at createJob and cannot be altered afterwards, guaranteeing machine compensation upon verification.
          </p>
        </div>
      </div>

      {/* 5. Matrix: Why Prices Differ (Generated from pricing factor lists) */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-bold text-gray-900">
            Pricing Factor Comparison
          </h2>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">
          Comparison of pricing model parameters between Package Transport and Color Sorting derived from pure pricing functions:
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 font-semibold">
                <th className="py-2.5 px-3">Dimension</th>
                <th className="py-2.5 px-3 text-blue-700">Transport Robot (M-042)</th>
                <th className="py-2.5 px-3 text-emerald-700">Color Sorting Arm (M-051)</th>
                <th className="py-2.5 px-3 text-gray-600">Pricing Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y border-b border-gray-100 text-gray-800">
              <tr>
                <td className="py-2.5 px-3 font-semibold text-gray-900">Base Price</td>
                <td className="py-2.5 px-3 font-mono font-medium text-blue-600">{TRANSPORT_BASE_PRICE} {NATIVE_SYMBOL}</td>
                <td className="py-2.5 px-3 font-mono font-medium text-emerald-600">{SORTING_BASE_PRICE} {NATIVE_SYMBOL}</td>
                <td className="py-2.5 px-3 text-gray-600">Mobility baseline preparation vs stationary arm calibration</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-gray-900">Primary Variable</td>
                <td className="py-2.5 px-3 font-mono text-blue-600">Distance ({TRANSPORT_KM_RATE} {NATIVE_SYMBOL}/km)</td>
                <td className="py-2.5 px-3 font-mono text-emerald-600">Objects ({SORTING_PER_OBJECT_RATE} {NATIVE_SYMBOL}/unit)</td>
                <td className="py-2.5 px-3 text-gray-600">Battery & transit range vs pick-and-place cycle duration</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-gray-900">Secondary Variable</td>
                <td className="py-2.5 px-3 font-mono text-blue-600">Weight ({TRANSPORT_KG_RATE} {NATIVE_SYMBOL}/kg)</td>
                <td className="py-2.5 px-3 font-mono text-emerald-600">Color Bins ({SORTING_PER_COLOR_RATE} {NATIVE_SYMBOL}/bin)</td>
                <td className="py-2.5 px-3 text-gray-600">Motor torque requirements vs multi-target trajectory angle</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-gray-900">Quality / SLA</td>
                <td className="py-2.5 px-3 text-blue-600 font-mono">Proof of Delivery</td>
                <td className="py-2.5 px-3 text-emerald-600 font-mono">&ge;{SORTING_ACCURACY_THRESHOLD}% (+{SORTING_ACCURACY_SURCHARGE} {NATIVE_SYMBOL})</td>
                <td className="py-2.5 px-3 text-gray-600">Optical classification accuracy threshold constraint</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-gray-900">Urgency Options</td>
                <td className="py-2.5 px-3 text-gray-700 font-mono">Priority (+{URGENCY_PRIORITY_FEE}), Urgent (+{URGENCY_URGENT_FEE})</td>
                <td className="py-2.5 px-3 text-gray-700 font-mono">Priority (+{URGENCY_PRIORITY_FEE}), Urgent (+{URGENCY_URGENT_FEE})</td>
                <td className="py-2.5 px-3 text-gray-600">Priority scheduling fee for fast queue processing</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
