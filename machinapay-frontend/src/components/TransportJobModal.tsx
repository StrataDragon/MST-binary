import React, { useState, useEffect } from "react";
import { X, Lock, CheckCircle2, AlertCircle, Info, Calculator, ArrowRight, ShieldCheck } from "lucide-react";
import { keccak256, parseEther, toUtf8Bytes } from "ethers";
import { calculateTransportPrice, TransportPricingParams, JobPriceCalculation } from "../lib/pricingEngine";
import { getEscrow, decodeContractError } from "../lib/wallet";

interface TransportJobModalProps {
  signer: any;
  isOpen: boolean;
  onClose: () => void;
  onJobCreated: (jobId: string, calc: JobPriceCalculation) => void;
}

export function TransportJobModal({
  signer,
  isOpen,
  onClose,
  onJobCreated,
}: TransportJobModalProps) {
  // Transport parameters
  const [pickup, setPickup] = useState("Warehouse A");
  const [destination, setDestination] = useState("Warehouse B");
  const [distanceKm, setDistanceKm] = useState<number>(5);
  const [weightKg, setWeightKg] = useState<number>(10);
  const [urgency, setUrgency] = useState<"STANDARD" | "PRIORITY" | "URGENT">("PRIORITY");
  const [demand, setDemand] = useState<"LOW" | "MEDIUM" | "HIGH">("HIGH");
  const [availability, setAvailability] = useState<"HIGH" | "MEDIUM" | "LOW">("LOW");

  // Pricing calculation state
  const [calculation, setCalculation] = useState<JobPriceCalculation>(() =>
    calculateTransportPrice({
      distanceKm: 5,
      weightKg: 10,
      urgency: "PRIORITY",
      demand: "HIGH",
      availability: "LOW",
    })
  );

  const [showExplanation, setShowExplanation] = useState(false);
  const [isPriceLocked, setIsPriceLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recalculate price whenever parameters change UNLESS already locked!
  function handleCalculate() {
    const calc = calculateTransportPrice({
      distanceKm,
      weightKg,
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
  }, [distanceKm, weightKg, urgency, demand, availability]);

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
      const jobId = keccak256(toUtf8Bytes(`transport-${Date.now()}-${Math.random()}`));
      const description = `Transport ${weightKg}kg package from ${pickup} to ${destination} (${distanceKm}km)`;

      // 1. Post canonical metadata off-chain to Backend
      let metadataHash = keccak256(toUtf8Bytes(description));
      try {
        const backendUrl = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:4000";
        const metaRes = await fetch(`${backendUrl}/api/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskType: "PACKAGE_TRANSPORT",
            machineId: "M-042",
            pickupLocation: pickup,
            destination,
            distanceKm,
            packageWeightKg: weightKg,
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
      // Price is locked to the exact calculated amount (e.g. 86 MST)
      const durationSeconds = 3600; // 1 hour
      const rewardEther = calculation.finalPrice.toString();
      const tx = await escrow.createJob(jobId, metadataHash, durationSeconds, description, {
        value: parseEther(rewardEther),
      });
      await tx.wait();

      setIsPriceLocked(true);
      onJobCreated(jobId, calculation);
      onClose();
    } catch (err: any) {
      console.error("Failed to post transport job:", err);
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
            <span className="px-2 py-0.5 rounded bg-accent-blue/10 border border-accent-blue/30 text-accent-blue text-[10px] font-bold">
              MACHINE M-042
            </span>
            <span className="text-xs text-[#9CA3AF]">PACKAGE_TRANSPORT</span>
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Create Transport Robot Job
          </h2>
          <p className="text-xs text-[#9CA3AF]">
            Configure payload & route parameters. Dynamic pricing engine will calculate an immutable deterministic quote.
          </p>
        </div>

        {/* Two-column layout: Form vs Price Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Form Controls */}
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-[#9CA3AF]">Pickup Location</label>
              <input
                type="text"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                disabled={isPriceLocked}
                className="w-full px-3 py-2 rounded-lg bg-[#141419] border border-[#1E1E24] text-xs text-white outline-none focus:border-accent-blue"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[#9CA3AF]">Destination</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                disabled={isPriceLocked}
                className="w-full px-3 py-2 rounded-lg bg-[#141419] border border-[#1E1E24] text-xs text-white outline-none focus:border-accent-blue"
              />
            </div>

            {/* Distance slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-[#9CA3AF]">Distance</span>
                <span className="text-white font-bold">{distanceKm} km</span>
              </div>
              <input
                type="range"
                min="1"
                max="25"
                step="1"
                value={distanceKm}
                onChange={(e) => setDistanceKm(Number(e.target.value))}
                disabled={isPriceLocked}
                className="w-full accent-accent-blue cursor-pointer"
              />
              <div className="text-[10px] text-[#6B7280] flex justify-between">
                <span>1 km</span>
                <span>Rate: 3 MST / km</span>
                <span>25 km</span>
              </div>
            </div>

            {/* Weight slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-[#9CA3AF]">Package Weight</span>
                <span className="text-white font-bold">{weightKg} kg</span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={weightKg}
                onChange={(e) => setWeightKg(Number(e.target.value))}
                disabled={isPriceLocked}
                className="w-full accent-accent-blue cursor-pointer"
              />
              <div className="text-[10px] text-[#6B7280] flex justify-between">
                <span>1 kg</span>
                <span>Rate: 1 MST / kg</span>
                <span>50 kg</span>
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
                        ? "bg-accent-blue text-white border-accent-blue"
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
                  <span>Machine Availability:</span>
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
                  className="text-[11px] text-accent-blue hover:underline flex items-center gap-1"
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
                      +{f.costMst} MST {f.isPercentage && "(+15%)"}
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
              <div className="rounded-lg border border-accent-blue/30 bg-accent-blue/5 p-3 text-[11px] text-[#9CA3AF] space-y-1.5 animate-fade-in">
                <div className="text-white font-bold flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-accent-blue" />
                  <span>Transparent Pricing Formula</span>
                </div>
                <p>
                  <span className="text-white font-semibold">Base Price (30 MST):</span> Standard mobilization fee for autonomous robot M-042.
                </p>
                <p>
                  <span className="text-white font-semibold">Distance:</span> {distanceKm} km × 3 MST = {distanceKm * 3} MST.
                </p>
                <p>
                  <span className="text-white font-semibold">Weight:</span> {weightKg} kg × 1 MST = {weightKg * 1} MST.
                </p>
                <p>
                  <span className="text-white font-semibold">Market Factors:</span> High regional demand adds +15% (11 MST); low vehicle availability adds +10 MST surcharge.
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
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-accent-blue hover:bg-blue-600 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-md"
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
