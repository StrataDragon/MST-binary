import React, { useState, useEffect, useRef } from "react";
import {
  Bot,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Check,
  XCircle,
  Award,
  DollarSign,
  Clock,
  MapPin,
  Package,
} from "lucide-react";

interface TransportSimulationViewProps {
  jobId: string;
  lockedAmountMst?: string | number;
  onSettled?: () => void;
}

export function TransportSimulationView({
  jobId,
  lockedAmountMst = "86",
  onSettled,
}: TransportSimulationViewProps) {
  const [stage, setStage] = useState<
    "idle" | "pickup" | "in_transit" | "delivered" | "verifying" | "settled" | "failed"
  >("idle");

  const [progressPercent, setProgressPercent] = useState(0);
  const [distanceCovered, setDistanceCovered] = useState(0);
  const [totalDistance] = useState(5.0);
  const [packageWeight] = useState(10);
  const [etaSeconds, setEtaSeconds] = useState(252); // ~04:12
  const [simulateFail, setSimulateFail] = useState(false);

  // Verifier consensus states
  const [verifierAlpha, setVerifierAlpha] = useState<"pending" | "pass" | "fail">("pending");
  const [verifierBeta, setVerifierBeta] = useState<"pending" | "pass" | "fail">("pending");
  const [verifierGamma, setVerifierGamma] = useState<"pending" | "pass" | "fail">("pending");
  const [consensusPass, setConsensusPass] = useState<boolean | null>(null);
  const [reputation, setReputation] = useState(96);

  // Settlement details
  const [settleTx, setSettleTx] = useState<string | null>(null);
  const [proofSignature, setProofSignature] = useState<string | null>(null);
  const [evidenceHash, setEvidenceHash] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("M-042 Ready at Depot. Click Start Mission to dispatch.");

  const intervalRef = useRef<any>(null);

  function startExecution() {
    if (stage !== "idle" && stage !== "settled" && stage !== "failed") return;
    setStage("pickup");
    setProgressPercent(10);
    setDistanceCovered(0.5);
    setStatusMessage("Package picked up at Warehouse A. Loading telemetry sensors...");

    let p = 10;
    let dist = 0.5;
    let eta = 252;

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      p += 10;
      dist = Math.min(totalDistance, Math.round((dist + 0.5) * 10) / 10);
      eta = Math.max(0, eta - 30);

      setProgressPercent(p);
      setDistanceCovered(dist);
      setEtaSeconds(eta);

      if (p >= 30 && p < 90) {
        setStage("in_transit");
        setStatusMessage(`Autonomous route started. In transit: ${dist} / ${totalDistance} km.`);
      }

      if (p >= 100) {
        clearInterval(intervalRef.current);
        if (simulateFail) {
          setStage("failed");
          setStatusMessage("Mission failed: Route blocked or battery critical. Proof reflects failure.");
          runVerificationAndSettlement("fail");
        } else {
          setStage("delivered");
          setProgressPercent(100);
          setDistanceCovered(totalDistance);
          setEtaSeconds(0);
          setStatusMessage("Destination reached! Package delivered at Warehouse B. Generating EIP-712 proof...");
          runVerificationAndSettlement("success");
        }
      }
    }, 600);
  }

  async function runVerificationAndSettlement(resultMode: "success" | "fail") {
    setStage("verifying");
    setStatusMessage("Submitting signed telemetry proof to multi-verifier network...");

    try {
      const backendUrl = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:4000";
      // First accept & start if not already
      try {
        await fetch(`${backendUrl}/machine/jobs/${jobId}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ machineId: "M-042" }),
        });
      } catch (e) {
        // May already be accepted
      }

      // Submit transport evidence
      const evRes = await fetch(`${backendUrl}/machine/jobs/${jobId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: "PACKAGE_TRANSPORT",
          machineId: "M-042",
          pickupLocation: "Warehouse A",
          destination: "Warehouse B",
          packageId: "PKG-042-ALPHA",
          packageWeightKg: packageWeight,
          distanceKm: totalDistance,
          delivered: resultMode === "success",
          result: resultMode,
          completedAt: new Date().toISOString(),
        }),
      });

      const resJson = await evRes.json();
      if (resJson.signature) setProofSignature(resJson.signature);
      if (resJson.proof?.evidenceHash) setEvidenceHash(resJson.proof.evidenceHash);

      // Simulate multi-verifier vote sequence
      setTimeout(() => setVerifierAlpha(resultMode === "success" ? "pass" : "fail"), 400);
      setTimeout(() => setVerifierBeta(resultMode === "success" ? "pass" : "fail"), 800);
      setTimeout(() => setVerifierGamma("pass"), 1200);

      setTimeout(() => {
        const passed = resultMode === "success";
        setConsensusPass(passed);
        setStage(passed ? "settled" : "failed");
        setSettleTx(resJson.verification?.settleTx || "0x9c4a8f3b2e1d087654acde99081234567890abcdef1234567890abcdef123456");

        if (passed) {
          setReputation(97); // 96 -> 97
          setStatusMessage(`💰 PAYMENT RELEASED! Machine M-042 received ${lockedAmountMst} MST. Reputation updated to 97.`);
        } else {
          setReputation(95);
          setStatusMessage(`REFUND ISSUED! Customer refunded ${lockedAmountMst} MST due to delivery failure.`);
        }
        if (onSettled) onSettled();
      }, 1600);
    } catch (err: any) {
      console.warn("Backend verifier submission error (using local simulation fallback):", err);
      // Fallback visual simulation
      setVerifierAlpha(resultMode === "success" ? "pass" : "fail");
      setVerifierBeta(resultMode === "success" ? "pass" : "fail");
      setVerifierGamma("pass");
      const passed = resultMode === "success";
      setConsensusPass(passed);
      setStage(passed ? "settled" : "failed");
      setSettleTx("0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""));
      if (passed) {
        setReputation(97);
        setStatusMessage(`💰 PAYMENT RELEASED! Machine M-042 received ${lockedAmountMst} MST.`);
      } else {
        setReputation(95);
        setStatusMessage(`REFUND ISSUED! Customer refunded ${lockedAmountMst} MST.`);
      }
    }
  }

  function handleReset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStage("idle");
    setProgressPercent(0);
    setDistanceCovered(0);
    setEtaSeconds(252);
    setVerifierAlpha("pending");
    setVerifierBeta("pending");
    setVerifierGamma("pending");
    setConsensusPass(null);
    setSettleTx(null);
    setProofSignature(null);
    setEvidenceHash(null);
    setReputation(96);
    setStatusMessage("M-042 Reset to Depot. Ready for new mission.");
  }

  const formatEta = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6 font-mono animate-fade-in">
      {/* 1. Hardware Header */}
      <div className="rounded-xl border border-[#1E1E24] bg-[#0B0B0E] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent-blue/10 border border-accent-blue/30 flex items-center justify-center text-accent-blue">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-wide">M-042</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                stage === "settled"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : stage === "failed"
                  ? "bg-red-500/10 text-red-400 border border-red-500/30"
                  : "bg-accent-blue/10 text-accent-blue border border-accent-blue/30"
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                STATUS: {stage === "idle" ? "READY" : stage.toUpperCase()}
              </span>
            </div>
            <h2 className="text-base font-bold text-white">Autonomous Transport Robot</h2>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="p-2.5 rounded-lg bg-[#141419] border border-[#1E1E24] text-center">
            <div className="text-[#9CA3AF] text-[10px]">Locked Escrow</div>
            <div className="text-sm font-bold text-accent-green">{lockedAmountMst} MST</div>
          </div>
          <div className="p-2.5 rounded-lg bg-[#141419] border border-[#1E1E24] text-center">
            <div className="text-[#9CA3AF] text-[10px]">Reputation</div>
            <div className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1">
              <Award className="w-3.5 h-3.5" />
              <span>{reputation}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Route & Progress HUD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Route Map & Live Telemetry */}
        <div className="lg:col-span-2 rounded-xl border border-[#1E1E24] bg-[#0B0B0E] p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-[#1E1E24] pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              Autonomous Navigation Telemetry
            </span>
            <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
              <Clock className="w-3.5 h-3.5 text-accent-blue" />
              <span>ETA: {formatEta(etaSeconds)}</span>
            </div>
          </div>

          {/* Route Milestones */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[#141419] border border-[#1E1E24]">
              <div className="text-[#9CA3AF] text-[10px]">Pickup</div>
              <div className="text-white font-semibold flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-accent-blue" />
                <span>Warehouse A</span>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#141419] border border-[#1E1E24]">
              <div className="text-[#9CA3AF] text-[10px]">Destination</div>
              <div className="text-white font-semibold flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-accent-green" />
                <span>Warehouse B</span>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#141419] border border-[#1E1E24]">
              <div className="text-[#9CA3AF] text-[10px]">Distance</div>
              <div className="text-white font-semibold mt-0.5">
                {distanceCovered.toFixed(1)} / {totalDistance} km
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#141419] border border-[#1E1E24]">
              <div className="text-[#9CA3AF] text-[10px]">Payload</div>
              <div className="text-white font-semibold flex items-center gap-1 mt-0.5">
                <Package className="w-3.5 h-3.5 text-amber-400" />
                <span>{packageWeight} kg</span>
              </div>
            </div>
          </div>

          {/* Progress Bar & Visual Pathway */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-[#9CA3AF]">Mission Route Completion</span>
              <span className="text-white">{progressPercent}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-[#1E1E24] overflow-hidden p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-blue to-accent-green transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[#6B7280]">
              <span>[Warehouse A] Depot</span>
              <span>Waypoints Alpha → Beta</span>
              <span>[Warehouse B] Dock 4</span>
            </div>
          </div>

          {/* Execution Checklist */}
          <div className="p-4 rounded-xl bg-[#141419] border border-[#1E1E24] space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-white">
              Autonomous Lifecycle Milestones
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className={`flex items-center gap-2 ${progressPercent >= 10 ? "text-accent-green" : "text-[#6B7280]"}`}>
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Package picked up at Warehouse A</span>
              </div>
              <div className={`flex items-center gap-2 ${progressPercent >= 40 ? "text-accent-green" : "text-[#6B7280]"}`}>
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Autonomous route started</span>
              </div>
              <div className={`flex items-center gap-2 ${progressPercent >= 90 ? "text-accent-green" : "text-[#6B7280]"}`}>
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Destination reached at Warehouse B</span>
              </div>
              <div className={`flex items-center gap-2 ${progressPercent >= 100 && stage !== "failed" ? "text-accent-green" : "text-[#6B7280]"}`}>
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Package safely delivered & verified</span>
              </div>
            </div>
          </div>

          {/* Interactive controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulateFail}
                  onChange={(e) => setSimulateFail(e.target.checked)}
                  disabled={stage !== "idle" && stage !== "settled" && stage !== "failed"}
                  className="rounded border-[#1E1E24] accent-red-500"
                />
                <span className="text-[#9CA3AF] hover:text-white">Simulate Route Obstruction / Failure</span>
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1E1E24] bg-white/5 hover:bg-white/10 text-white text-xs font-semibold transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
              <button
                onClick={startExecution}
                disabled={stage !== "idle" && stage !== "settled" && stage !== "failed"}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-accent-blue hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>START TRANSPORT MISSION</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Col: Verifier Consensus & Settlement */}
        <div className="space-y-6">
          {/* Multi-Verifier Quorum Card */}
          <div className="rounded-xl border border-[#1E1E24] bg-[#0B0B0E] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E1E24] pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                Multi-Verifier Consensus
              </span>
              <span className="text-[10px] text-accent-blue font-semibold">Quorum: ≥2/3</span>
            </div>

            <div className="space-y-2.5 text-xs">
              {/* Verifier Alpha */}
              <div className="p-2.5 rounded-lg bg-[#141419] border border-[#1E1E24] flex items-center justify-between">
                <div>
                  <div className="text-white font-semibold">Verifier Alpha</div>
                  <div className="text-[10px] text-[#9CA3AF]">EIP-712 Signature & Hashes</div>
                </div>
                <div>
                  {verifierAlpha === "pending" && <span className="text-[#6B7280] text-[10px]">PENDING</span>}
                  {verifierAlpha === "pass" && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" /> PASS
                    </span>
                  )}
                  {verifierAlpha === "fail" && (
                    <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-bold flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> FAIL
                    </span>
                  )}
                </div>
              </div>

              {/* Verifier Beta */}
              <div className="p-2.5 rounded-lg bg-[#141419] border border-[#1E1E24] flex items-center justify-between">
                <div>
                  <div className="text-white font-semibold">Verifier Beta</div>
                  <div className="text-[10px] text-[#9CA3AF]">Drop Coordinates & Sensor Telemetry</div>
                </div>
                <div>
                  {verifierBeta === "pending" && <span className="text-[#6B7280] text-[10px]">PENDING</span>}
                  {verifierBeta === "pass" && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" /> PASS
                    </span>
                  )}
                  {verifierBeta === "fail" && (
                    <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-bold flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> FAIL
                    </span>
                  )}
                </div>
              </div>

              {/* Verifier Gamma */}
              <div className="p-2.5 rounded-lg bg-[#141419] border border-[#1E1E24] flex items-center justify-between">
                <div>
                  <div className="text-white font-semibold">Verifier Gamma</div>
                  <div className="text-[10px] text-[#9CA3AF]">Registry Policy & Stake Collateral</div>
                </div>
                <div>
                  {verifierGamma === "pending" && <span className="text-[#6B7280] text-[10px]">PENDING</span>}
                  {verifierGamma === "pass" && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" /> PASS
                    </span>
                  )}
                  {verifierGamma === "fail" && (
                    <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-bold flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> FAIL
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Consensus Status */}
            {consensusPass !== null && (
              <div className={`p-3 rounded-lg border text-xs text-center font-bold ${
                consensusPass
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
              }`}>
                {consensusPass ? "CONSENSUS: 3/3 PASS → RELEASE PAYMENT" : "CONSENSUS: FAILED → REFUND CUSTOMER"}
              </div>
            )}
          </div>

          {/* Settlement Result Box */}
          <div className="rounded-xl border border-[#1E1E24] bg-[#0B0B0E] p-5 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              Settlement Status
            </span>
            <div className="text-xs text-[#9CA3AF] leading-relaxed">
              {statusMessage}
            </div>
            {settleTx && (
              <div className="p-2.5 rounded-lg bg-black/40 border border-[#1E1E24] text-[10px] text-[#9CA3AF] space-y-1">
                <div className="text-white font-semibold">On-Chain Settlement Tx:</div>
                <div className="truncate text-accent-blue font-mono">{settleTx}</div>
                <div className="text-[9px] text-[#6B7280]">
                  Native escrow smart contract executed automatically.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
