import React, { useState, useEffect, useRef } from "react";
import {
  Cpu,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Check,
  XCircle,
  Award,
  Layers,
  Sparkles,
  Eye,
  RefreshCw,
} from "lucide-react";

interface ColorSortingSimulationViewProps {
  jobId: string;
  lockedAmountMst?: string | number;
  onSettled?: () => void;
}

interface ObjectItem {
  id: number;
  color: "RED" | "BLUE" | "GREEN" | "YELLOW";
  label: string;
  colorHex: string;
}

export function ColorSortingSimulationView({
  jobId,
  lockedAmountMst = "80",
  onSettled,
}: ColorSortingSimulationViewProps) {
  const [stage, setStage] = useState<
    "idle" | "sorting" | "completed" | "verifying" | "settled" | "failed"
  >("idle");

  const [totalObjects] = useState(100);
  const [processedCount, setProcessedCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [requiredAccuracy] = useState(95);

  // Arm step state
  const [armAction, setArmAction] = useState<
    "IDLE" | "DETECTING" | "PICKING" | "MOVING" | "PLACED"
  >("IDLE");
  const [currentObject, setCurrentObject] = useState<ObjectItem | null>(null);

  // Color bins count
  const [binCounts, setBinCounts] = useState({
    RED: 0,
    BLUE: 0,
    GREEN: 0,
    YELLOW: 0,
  });

  const [simulateFail, setSimulateFail] = useState(false);

  // Verifier consensus states
  const [verifierAlpha, setVerifierAlpha] = useState<"pending" | "pass" | "fail">("pending");
  const [verifierBeta, setVerifierBeta] = useState<"pending" | "pass" | "fail">("pending");
  const [verifierGamma, setVerifierGamma] = useState<"pending" | "pass" | "fail">("pending");
  const [consensusPass, setConsensusPass] = useState<boolean | null>(null);
  const [reputation, setReputation] = useState(94);

  // Settlement details
  const [settleTx, setSettleTx] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    "M-051 Robotic Arm calibrated and in standby. Click Start Sorting to run."
  );

  const intervalRef = useRef<any>(null);

  const actualAccuracy =
    processedCount > 0 ? Math.round((correctCount / processedCount) * 100) : 100;

  const COLOR_PALETTE: { color: "RED" | "BLUE" | "GREEN" | "YELLOW"; hex: string }[] = [
    { color: "RED", hex: "#EF4444" },
    { color: "BLUE", hex: "#3B82F6" },
    { color: "GREEN", hex: "#10B981" },
    { color: "YELLOW", hex: "#F59E0B" },
  ];

  function startSorting() {
    if (stage !== "idle" && stage !== "settled" && stage !== "failed") return;
    setStage("sorting");
    setStatusMessage("Optical sensor online. Conveyor fed with 100 items. Arm initiating pick cycles...");

    let count = 0;
    let correct = 0;
    let incorrect = 0;
    const bins = { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0 };

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      count++;
      const pick = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
      const objItem: ObjectItem = {
        id: count,
        color: pick.color,
        label: pick.color,
        colorHex: pick.hex,
      };
      setCurrentObject(objItem);

      // Determine correct vs incorrect (simulated error rate)
      const isErr = simulateFail ? count % 4 === 0 : count === 32 || count === 68 || count === 85;
      if (isErr) {
        incorrect++;
        // Placed in wrong bin randomly
        const wrongColor = COLOR_PALETTE.find((c) => c.color !== pick.color)!.color;
        bins[wrongColor]++;
      } else {
        correct++;
        bins[pick.color]++;
      }

      setProcessedCount(count);
      setCorrectCount(correct);
      setIncorrectCount(incorrect);
      setBinCounts({ ...bins });

      // Arm animation micro-states
      if (count % 3 === 1) {
        setArmAction("PICKING");
      } else if (count % 3 === 2) {
        setArmAction("MOVING");
      } else {
        setArmAction("PLACED");
      }

      if (count >= totalObjects) {
        clearInterval(intervalRef.current);
        const finalAcc = Math.round((correct / totalObjects) * 100);
        const passed = finalAcc >= requiredAccuracy;

        if (passed) {
          setStage("completed");
          setStatusMessage(
            `Sorting complete! ${correct}/${totalObjects} objects sorted (${finalAcc}% accuracy >= ${requiredAccuracy}% required). Generating proof...`
          );
          runVerificationAndSettlement("success", finalAcc, correct, incorrect, bins);
        } else {
          setStage("failed");
          setStatusMessage(
            `Sorting failed: Achieved ${finalAcc}% accuracy which is below required ${requiredAccuracy}% threshold.`
          );
          runVerificationAndSettlement("fail", finalAcc, correct, incorrect, bins);
        }
      }
    }, 120); // Fast, realistic ~12 sec demo execution
  }

  async function runVerificationAndSettlement(
    resultMode: "success" | "fail",
    accuracy: number,
    correct: number,
    incorrect: number,
    distribution: any
  ) {
    setStage("verifying");
    setStatusMessage("M-051 signing EIP-712 proof with onboard key... Transmitting to Verifiers.");

    try {
      const backendUrl = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:4000";
      // Accept job with M-051
      try {
        await fetch(`${backendUrl}/machine/jobs/${jobId}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ machineId: "M-051" }),
        });
      } catch (e) {
        // Ignored if already accepted
      }

      // Submit Color Sorting evidence
      const evRes = await fetch(`${backendUrl}/machine/jobs/${jobId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: "COLOR_SORTING",
          machineId: "M-051",
          objectsProcessed: totalObjects,
          correctlySorted: correct,
          incorrectlySorted: incorrect,
          colorDistribution: {
            red: distribution.RED,
            blue: distribution.BLUE,
            green: distribution.GREEN,
            yellow: distribution.YELLOW,
          },
          requiredAccuracy,
          actualAccuracy: accuracy,
          result: resultMode,
          completedAt: new Date().toISOString(),
        }),
      });

      const resJson = await evRes.json();

      // Multi-verifier visual voting sequence
      setTimeout(() => setVerifierAlpha("pass"), 400);
      setTimeout(() => setVerifierBeta(resultMode === "success" ? "pass" : "fail"), 800);
      setTimeout(() => setVerifierGamma("pass"), 1200);

      setTimeout(() => {
        const passed = resultMode === "success";
        setConsensusPass(passed);
        setStage(passed ? "settled" : "failed");
        setSettleTx(resJson.verification?.settleTx || "0x5d8a9e7f1234567890abcdef1234567890abcdef1234567890abcdef12345678");

        if (passed) {
          setReputation(95); // 94 -> 95
          setStatusMessage(
            `💰 PAYMENT RELEASED! Machine M-051 received ${lockedAmountMst} MST. Reputation updated to 95.`
          );
        } else {
          setReputation(93);
          setStatusMessage(
            `REFUND ISSUED! Customer refunded ${lockedAmountMst} MST due to accuracy SLA breach.`
          );
        }
        if (onSettled) onSettled();
      }, 1600);
    } catch (err: any) {
      console.warn("Backend verifier submission error (using local simulation fallback):", err);
      setVerifierAlpha("pass");
      setVerifierBeta(resultMode === "success" ? "pass" : "fail");
      setVerifierGamma("pass");
      const passed = resultMode === "success";
      setConsensusPass(passed);
      setStage(passed ? "settled" : "failed");
      setSettleTx("0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""));
      if (passed) {
        setReputation(95);
        setStatusMessage(`💰 PAYMENT RELEASED! Machine M-051 received ${lockedAmountMst} MST.`);
      } else {
        setReputation(93);
        setStatusMessage(`REFUND ISSUED! Customer refunded ${lockedAmountMst} MST.`);
      }
    }
  }

  function handleReset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStage("idle");
    setProcessedCount(0);
    setCorrectCount(0);
    setIncorrectCount(0);
    setBinCounts({ RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0 });
    setArmAction("IDLE");
    setCurrentObject(null);
    setVerifierAlpha("pending");
    setVerifierBeta("pending");
    setVerifierGamma("pending");
    setConsensusPass(null);
    setSettleTx(null);
    setReputation(94);
    setStatusMessage("M-051 Robotic Arm Reset. Ready for new sorting job.");
  }

  return (
    <div className="space-y-6 font-mono animate-fade-in">
      {/* 1. Hardware Header */}
      <div className="rounded-xl border border-[#1E1E24] bg-[#0B0B0E] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-accent-green">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-wide">M-051</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                stage === "settled"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : stage === "failed"
                  ? "bg-red-500/10 text-red-400 border border-red-500/30"
                  : "bg-accent-green/10 text-accent-green border border-accent-green/30"
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                STATUS: {stage === "idle" ? "READY" : stage.toUpperCase()}
              </span>
            </div>
            <h2 className="text-base font-bold text-white">Robotic Pick-and-Place Arm (6-Axis)</h2>
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

      {/* 2. Visual Robotic Arm Chamber & Color Sorting Simulation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Unsorted Stream -> Color Sensor -> Robotic Arm -> 4 Color Bins */}
        <div className="lg:col-span-2 rounded-xl border border-[#1E1E24] bg-[#0B0B0E] p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-[#1E1E24] pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              Optical Sorting Telemetry & Manipulator Arm
            </span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#9CA3AF]">Accuracy:</span>
              <span className={`font-bold ${actualAccuracy >= requiredAccuracy ? "text-accent-green" : "text-red-400"}`}>
                {actualAccuracy}% (Req: ≥{requiredAccuracy}%)
              </span>
            </div>
          </div>

          {/* SIMULATION DIAGRAM: STREAM → SENSOR → ARM → BINS */}
          <div className="p-5 rounded-xl bg-[#141419] border border-[#1E1E24] space-y-5">
            {/* Step A: Unsorted Conveyor Stream */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-[#9CA3AF]">
                <span className="font-semibold text-white uppercase tracking-wider">
                  Unsorted Objects Stream
                </span>
                <span>{processedCount} / {totalObjects} Processed</span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-black/40 border border-[#1E1E24] overflow-x-auto">
                {Array.from({ length: 8 }).map((_, i) => {
                  const colors = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B"];
                  const col = colors[(processedCount + i) % colors.length];
                  return (
                    <div
                      key={i}
                      className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center shadow-md transition-all animate-pulse"
                      style={{ backgroundColor: col }}
                    />
                  );
                })}
                <span className="text-xs text-[#6B7280] ml-2">...</span>
              </div>
            </div>

            {/* Step B: Color Sensor & Robotic Arm Centerstage */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-[#0F0F14] border border-[#22222B]">
              {/* Sensor HUD */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-accent-blue">
                  <Eye className="w-4 h-4" />
                  <span>Optoelectronic Color Sensor</span>
                </div>
                <div className="p-3 rounded bg-black/50 border border-[#1E1E24] text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#9CA3AF]">Current Target:</span>
                    <span className="text-white font-semibold">
                      {currentObject ? `Object #${currentObject.id}` : "Awaiting Object"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#9CA3AF]">Detected Wavelength:</span>
                    {currentObject ? (
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold text-black"
                        style={{ backgroundColor: currentObject.colorHex }}
                      >
                        {currentObject.color}
                      </span>
                    ) : (
                      <span className="text-[#6B7280]">--</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Arm Manipulator State */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-accent-green">
                  <Cpu className="w-4 h-4" />
                  <span>Robotic Arm Kinematics</span>
                </div>
                <div className="p-3 rounded bg-black/50 border border-[#1E1E24] text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#9CA3AF]">Manipulator Mode:</span>
                    <span className="text-accent-green font-bold">
                      {armAction === "IDLE" && "Standby"}
                      {armAction === "PICKING" && "🦾 Picking Object..."}
                      {armAction === "MOVING" && "🦾 Moving to Bin..."}
                      {armAction === "PLACED" && "✓ Placed into Bin"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9CA3AF]">Kinematic Cycle:</span>
                    <span className="text-white">120ms cycle time</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Step C: 4 Color Bins */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white">
                Destination Bins
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {/* Red Bin */}
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-center space-y-1">
                  <div className="w-3 h-3 rounded-full bg-red-500 mx-auto" />
                  <div className="text-red-400 font-bold">RED BIN</div>
                  <div className="text-lg font-bold text-white">{binCounts.RED}</div>
                  <div className="text-[10px] text-[#9CA3AF]">units</div>
                </div>

                {/* Blue Bin */}
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-center space-y-1">
                  <div className="w-3 h-3 rounded-full bg-blue-500 mx-auto" />
                  <div className="text-blue-400 font-bold">BLUE BIN</div>
                  <div className="text-lg font-bold text-white">{binCounts.BLUE}</div>
                  <div className="text-[10px] text-[#9CA3AF]">units</div>
                </div>

                {/* Green Bin */}
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center space-y-1">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 mx-auto" />
                  <div className="text-emerald-400 font-bold">GREEN BIN</div>
                  <div className="text-lg font-bold text-white">{binCounts.GREEN}</div>
                  <div className="text-[10px] text-[#9CA3AF]">units</div>
                </div>

                {/* Yellow Bin */}
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center space-y-1">
                  <div className="w-3 h-3 rounded-full bg-amber-400 mx-auto" />
                  <div className="text-amber-400 font-bold">YELLOW BIN</div>
                  <div className="text-lg font-bold text-white">{binCounts.YELLOW}</div>
                  <div className="text-[10px] text-[#9CA3AF]">units</div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-3 text-xs text-center">
            <div className="p-3 rounded-lg bg-[#141419] border border-[#1E1E24]">
              <div className="text-[#9CA3AF] text-[10px]">Correctly Sorted</div>
              <div className="text-lg font-bold text-accent-green">{correctCount}</div>
            </div>
            <div className="p-3 rounded-lg bg-[#141419] border border-[#1E1E24]">
              <div className="text-[#9CA3AF] text-[10px]">Incorrectly Sorted</div>
              <div className="text-lg font-bold text-red-400">{incorrectCount}</div>
            </div>
            <div className="p-3 rounded-lg bg-[#141419] border border-[#1E1E24]">
              <div className="text-[#9CA3AF] text-[10px]">Actual Accuracy</div>
              <div className={`text-lg font-bold ${actualAccuracy >= requiredAccuracy ? "text-accent-green" : "text-red-400"}`}>
                {actualAccuracy}%
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
                <span className="text-[#9CA3AF] hover:text-white">Simulate Sensor Drift (&lt;95% Accuracy)</span>
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
                onClick={startSorting}
                disabled={stage !== "idle" && stage !== "settled" && stage !== "failed"}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-accent-green hover:bg-emerald-600 disabled:opacity-50 text-black text-xs font-bold transition-all shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>START SORTING MISSION</span>
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
              <span className="text-[10px] text-accent-green font-semibold">Quorum: ≥2/3</span>
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
                  <div className="text-[10px] text-[#9CA3AF]">Optical Telemetry & Accuracy SLA</div>
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
                  <div className="text-[10px] text-[#9CA3AF]">Registry Policy & Collateral</div>
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
                <div className="truncate text-accent-green font-mono">{settleTx}</div>
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
