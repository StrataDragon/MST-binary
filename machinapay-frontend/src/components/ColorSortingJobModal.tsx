import React, { useState, useEffect } from "react";
import { X, Lock, CheckCircle2, AlertCircle, Info, Calculator, ArrowRight, ShieldCheck, CheckSquare, Square } from "lucide-react";
import { keccak256, parseEther, toUtf8Bytes } from "ethers";
import { calculateColorSortingPrice, ColorSortingPricingParams, JobPriceCalculation } from "../lib/pricingEngine";
import { getEscrow, decodeContractError } from "../lib/wallet";

interface ColorSortingJobModalProps {
  signer: any;
  isOpen: boolean;
  onClose: () => void;
  onJobCreated: (jobId: string, calc: JobPriceCalculation) => void;
}

const AVAILABLE_COLORS = [
  { name: "RED", label: "Red", colorClass: "text-red-500", bgClass: "bg-red-500/20 border-red-500/40" },
  { name: "BLUE", label: "Blue", colorClass: "text-blue-500", bgClass: "bg-blue-500/20 border-blue-500/40" },
  { name: "GREEN", label: "Green", colorClass: "text-emerald-500", bgClass: "bg-emerald-500/20 border-emerald-500/40" },
  { name: "YELLOW", label: "Yellow", colorClass: "text-amber-400", bgClass: "bg-amber-500/20 border-amber-500/40" },
];

export function ColorSortingJobModal({
  signer,
  isOpen,
  onClose,
  onJobCreated,
}: ColorSortingJobModalProps) {
  // Color sorting parameters
  const [objectCount, setObjectCount] = useState<number>(100);
  const [selectedColors, setSelectedColors] = useState<string[]>(["RED", "BLUE", "GREEN", "YELLOW"]);
  const [requiredAccuracy, setRequiredAccuracy] = useState<number>(95);
  const [urgency, setUrgency] = useState<"STANDARD" | "PRIORITY" | "URGENT">("PRIORITY");
  const [demand, setDemand] = useState<"LOW" | "MEDIUM" | "HIGH">("HIGH");
  const [availability, setAvailability] = useState<"HIGH" | "MEDIUM" | "LOW">("LOW");

  // Pricing calculation state
  const [calculation, setCalculation] = useState<JobPriceCalculation>(() =>
    calculateColorSortingPrice({
      objectCount: 100,
      colors: ["RED", "BLUE", "GREEN", "YELLOW"],
      requiredAccuracyPercent: 95,
      urgency: "PRIORITY",
      demand: "HIGH",
      availability: "LOW",
    })
  );

  const [showExplanation, setShowExplanation] = useState(false);
  const [isPriceLocked, setIsPriceLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleColor(colorName: string) {
    if (isPriceLocked) return;
    if (selectedColors.includes(colorName)) {
      if (selectedColors.length <= 1) return; // Keep at least one color
      setSelectedColors(selectedColors.filter((c) => c !== colorName));
    } else {
      setSelectedColors([...selectedColors, colorName]);
    }
  }

  function handleCalculate() {
    const calc = calculateColorSortingPrice({
      objectCount,
      colors: selectedColors,
      requiredAccuracyPercent: requiredAccuracy,
      urgency,
      demand,
      availability,
    });
    setCalculation(calc);
  }

  useEffect(() => {
    if (!isPriceLocked) {
      handleCalculate();
    }
  }, [objectCount, selectedColors, requiredAccuracy, urgency, demand, availability]);

  async function handleLockAndPostJob() {
    if (!signer) {
      setError("Please connect your Web3 wallet first.");
      return;
    }
    setBusy(true);
    setError(null);

    let escrow: any;
    try {
      escrow = getEscrow(signer);
      const jobId = keccak256(toUtf8Bytes(`color-sort-${Date.now()}-${Math.random()}`));
      const description = `Sort ${objectCount} objects into ${selectedColors.length} colors with >=${requiredAccuracy}% accuracy`;

      // 1. Post metadata to Backend
      let metadataHash = keccak256(toUtf8Bytes(description));
      try {
        const backendUrl = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:4000";
        const metaRes = await fetch(`${backendUrl}/api/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskType: "COLOR_SORTING",
            machineId: "M-051",
            objectCount,
            colors: selectedColors,
            requiredAccuracyPercent: requiredAccuracy,
            description,
            pricing: calculation,
          }),
        });
        if (metaRes.ok) {
          const metaJson = await metaRes.json();
          if (metaJson.metadataHash) {
            metadataHash = metaJson.metadataHash;
          }
        }
      } catch (e) {
        console.warn("Could not reach backend metadata service, fallback to direct hash", e);
      }

      // 2. Lock funds in JobEscrow on-chain
      // Price is locked to the exact calculated amount (e.g. 80 MST)
      const durationSeconds = 3600;
      const rewardEther = calculation.finalPrice.toString();
      const tx = await escrow.createJob(jobId, metadataHash, durationSeconds, description, {
        value: parseEther(rewardEther),
      });
      await tx.wait();

      setIsPriceLocked(true);
      onJobCreated(jobId, calculation);
      onClose();
    } catch (err: any) {
      console.error("Failed to post color sorting job:", err);
      setError(decodeContractError(err, escrow));
    } finally {
      setBusy(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in font-mono">
      <div className="w-full max-w-2xl rounded-xl border border-[#1E1E24] bg-[#0B0B0E] shadow-2xl p-6 relative max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[#9CA3AF] hover:text-white hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="mb-6 space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-accent-green/10 border border-accent-green/30 text-accent-green text-[10px] font-bold">
              MACHINE M-051
            </span>
            <span className="text-xs text-[#9CA3AF]">COLOR_SORTING</span>
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Create Color Sorting Arm Job
          </h2>
          <p className="text-xs text-[#9CA3AF]">
            Configure manipulator arm sorting parameters. Dynamic pricing engine factors object count, bin complexity, and optical threshold.
          </p>
        </div>

        {/* Two-column layout: Form vs Price Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Form Controls */}
          <div className="space-y-4">
            {/* Number of objects */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-[#9CA3AF]">Number of Objects</span>
                <span className="text-white font-bold">{objectCount} units</span>
              </div>
              <input
                type="range"
                min="20"
                max="500"
                step="10"
                value={objectCount}
                onChange={(e) => setObjectCount(Number(e.target.value))}
                disabled={isPriceLocked}
                className="w-full accent-accent-green cursor-pointer"
              />
              <div className="text-[10px] text-[#6B7280] flex justify-between">
                <span>20 units</span>
                <span>Rate: 0.20 MST / object</span>
                <span>500 units</span>
              </div>
            </div>

            {/* Colors selection */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#9CA3AF]">Active Color Bins ({selectedColors.length} selected)</label>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_COLORS.map((c) => {
                  const isChecked = selectedColors.includes(c.name);
                  return (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => toggleColor(c.name)}
                      disabled={isPriceLocked}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-semibold transition-all ${
                        isChecked
                          ? c.bgClass
                          : "bg-[#141419] border-[#1E1E24] text-[#6B7280] opacity-60"
                      }`}
                    >
                      {isChecked ? (
                        <CheckSquare className={`w-4 h-4 ${c.colorClass}`} />
                      ) : (
                        <Square className="w-4 h-4 text-[#6B7280]" />
                      )}
                      <span className={isChecked ? "text-white" : "text-[#6B7280]"}>{c.label} Bin</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Required Accuracy */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-[#9CA3AF]">Required Accuracy</span>
                <span className="text-accent-green font-bold">{requiredAccuracy}%</span>
              </div>
              <input
                type="range"
                min="80"
                max="99"
                step="1"
                value={requiredAccuracy}
                onChange={(e) => setRequiredAccuracy(Number(e.target.value))}
                disabled={isPriceLocked}
                className="w-full accent-accent-green cursor-pointer"
              />
              <div className="text-[10px] text-[#6B7280] flex justify-between">
                <span>80% Standard</span>
                <span>95% High Precision (+5 MST)</span>
                <span>99% Ultra</span>
              </div>
            </div>

            {/* Urgency */}
            <div className="space-y-1">
              <label className="text-xs text-[#9CA3AF]">Urgency Priority</label>
              <div className="grid grid-cols-3 gap-2">
                {(["STANDARD", "PRIORITY", "URGENT"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setUrgency(lvl)}
                    disabled={isPriceLocked}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                      urgency === lvl
                        ? "bg-accent-green text-black border-accent-green"
                        : "bg-[#141419] border-[#1E1E24] text-[#9CA3AF] hover:text-white"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Common Market Factors */}
            <div className="p-3 rounded-lg bg-[#141419] border border-[#1E1E24] space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white flex items-center justify-between">
                <span>Market Factors</span>
                <span className="text-[10px] text-accent-green font-normal">Dynamic</span>
              </div>

              {/* Demand */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-[#9CA3AF]">
                  <span>Current Demand:</span>
                  <span className="text-white font-semibold">{demand}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["LOW", "MEDIUM", "HIGH"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDemand(d)}
                      disabled={isPriceLocked}
                      className={`py-1 px-1.5 rounded text-[10px] font-semibold border ${
                        demand === d
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : "bg-black/30 border-[#1E1E24] text-[#9CA3AF]"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Availability */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-[#9CA3AF]">
                  <span>Arm Availability:</span>
                  <span className="text-white font-semibold">{availability}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["HIGH", "MEDIUM", "LOW"] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAvailability(a)}
                      disabled={isPriceLocked}
                      className={`py-1 px-1.5 rounded text-[10px] font-semibold border ${
                        availability === a
                          ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                          : "bg-black/30 border-[#1E1E24] text-[#9CA3AF]"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Price Breakdown */}
          <div className="flex flex-col justify-between space-y-4">
            <div className="rounded-xl border border-[#1E1E24] bg-[#141419] p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#1E1E24] pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Price Breakdown
                </span>
                <button
                  type="button"
                  onClick={() => setShowExplanation(!showExplanation)}
                  className="text-[11px] text-accent-green hover:underline flex items-center gap-1"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>How was this calculated?</span>
                </button>
              </div>

              {/* Factors list */}
              <div className="space-y-2 text-xs">
                {calculation.factors.map((f, i) => (
                  <div key={i} className="flex justify-between items-center text-[#9CA3AF]">
                    <span>{f.name}</span>
                    <span className="text-white font-semibold">
                      +{f.costMst} MST
                    </span>
                  </div>
                ))}
              </div>

              {/* Final Price Box */}
              <div className="mt-4 pt-3 border-t border-[#1E1E24] space-y-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-[#9CA3AF] uppercase font-bold">Final Price</span>
                  <div className="text-2xl font-bold text-accent-green">
                    {calculation.finalPrice} MST
                  </div>
                </div>
                <div className="text-[10px] text-[#6B7280]">
                  Deterministic calculation • Exact amount to lock in escrow
                </div>
              </div>
            </div>

            {/* Explanation drawer if toggled */}
            {showExplanation && (
              <div className="rounded-lg border border-accent-green/30 bg-accent-green/5 p-3 text-[11px] text-[#9CA3AF] space-y-1.5 animate-fade-in">
                <div className="text-white font-bold flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-accent-green" />
                  <span>Transparent Sorting Formula</span>
                </div>
                <p>
                  <span className="text-white font-semibold">Base Price (20 MST):</span> Manipulator arm calibration & optoelectronic sensor boot.
                </p>
                <p>
                  <span className="text-white font-semibold">Object Count:</span> {objectCount} × 0.20 MST = {(objectCount * 0.2).toFixed(0)} MST.
                </p>
                <p>
                  <span className="text-white font-semibold">Color Complexity:</span> {selectedColors.length} colors × 2 MST = {selectedColors.length * 2} MST.
                </p>
                <p>
                  <span className="text-white font-semibold">Accuracy Requirement:</span> {requiredAccuracy}% threshold = +5 MST.
                </p>
                <p>
                  <span className="text-white font-semibold">Market Factors:</span> High demand (+12 MST) + Low availability (+5 MST).
                </p>
              </div>
            )}

            {/* Price Lock Notice */}
            <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <Lock className="w-3.5 h-3.5" />
                <span>PRICE LOCK RULE</span>
              </div>
              <p className="text-[11px] text-[#9CA3AF]">
                Once funded, your job price is permanently locked at <span className="text-white font-semibold">{calculation.finalPrice} MST</span>. Later shifts in demand or availability will NOT change an already-funded job.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Lock and Fund Action */}
            <button
              onClick={handleLockAndPostJob}
              disabled={busy || !signer}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-accent-green hover:bg-emerald-600 disabled:opacity-50 text-black font-bold text-xs transition-all shadow-md"
            >
              <Lock className="w-4 h-4" />
              <span>
                {busy
                  ? "LOCKING MST IN ESCROW…"
                  : `LOCK ${calculation.finalPrice} MST & POST JOB`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
