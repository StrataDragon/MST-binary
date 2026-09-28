import React, { useState, useEffect, useRef } from "react";
import { Play, RotateCcw, CheckCircle2, AlertTriangle, Cpu, Navigation, Send, ArrowRight } from "lucide-react";
import { machineApi } from "../lib/api";
import { DEFAULT_EVIDENCE_TARGET } from "../lib/config";

interface RobotSimulationChamberProps {
  selectedJobId: string | null;
  onEvidenceSubmitted: () => void;
}

export function RobotSimulationChamber({ selectedJobId, onEvidenceSubmitted }: RobotSimulationChamberProps) {
  const [posX, setPosX] = useState(1);
  const [posY, setPosY] = useState(1);
  const [targetX, setTargetX] = useState(DEFAULT_EVIDENCE_TARGET.target.x);
  const [targetY, setTargetY] = useState(DEFAULT_EVIDENCE_TARGET.target.y);
  const [isMoving, setIsMoving] = useState(false);
  const [historyTrail, setHistoryTrail] = useState<{ x: number; y: number }[]>([{ x: 1, y: 1 }]);
  const [isDelivered, setIsDelivered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusLog, setStatusLog] = useState<string>("Ready at depot (1, 1). Select action to dispatch.");

  const intervalRef = useRef<any>(null);

  // Compute Euclidean distance to target
  const distance = Math.sqrt(Math.pow(targetX - posX, 2) + Math.pow(targetY - posY, 2)).toFixed(2);

  // Animate robot movement
  function startSimulation(mode: "success" | "fail") {
    if (isMoving) return;
    setIsMoving(true);
    setIsDelivered(false);
    setStatusLog(`Robot dispatched from depot. Navigating towards target zone (${targetX}, ${targetY})...`);

    let curX = 1;
    let curY = 1;
    const destX = mode === "success" ? targetX : 4;
    const destY = mode === "success" ? targetY : 2;

    const trail: { x: number; y: number }[] = [{ x: 1, y: 1 }];

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      if (curX < destX) curX++;
      else if (curX > destX) curX--;

      if (curY < destY) curY++;
      else if (curY > destY) curY--;

      setPosX(curX);
      setPosY(curY);
      trail.push({ x: curX, y: curY });
      setHistoryTrail([...trail]);

      if (curX === destX && curY === destY) {
        clearInterval(intervalRef.current);
        setIsMoving(false);
        const delivered = mode === "success";
        setIsDelivered(delivered);
        if (delivered) {
          setStatusLog(`Target reached at (${destX}, ${destY})! Package delivered successfully. Sensor payload ready.`);
        } else {
          setStatusLog(`Robot stopped at (${destX}, ${destY}). Target missed or obstructed!`);
        }
      }
    }, 200);
  }

  function handleReset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsMoving(false);
    setPosX(1);
    setPosY(1);
    setIsDelivered(false);
    setHistoryTrail([{ x: 1, y: 1 }]);
    setStatusLog("Reset to depot (1, 1).");
  }

  async function handleSubmitEvidence() {
    if (!selectedJobId) {
      setStatusLog("Error: Select an active job in the header first.");
      return;
    }
    setBusy(true);
    setStatusLog("Submitting telemetry evidence to Member 3 verifier engine...");
    try {
      const res = await machineApi.submitEvidence(selectedJobId, {
        packageId: DEFAULT_EVIDENCE_TARGET.packageId,
        target: {
          zone: DEFAULT_EVIDENCE_TARGET.target.zone,
          x: targetX,
          y: targetY,
        },
        finalPosition: { x: posX, y: posY },
        delivered: isDelivered,
        result: isDelivered ? "success" : "fail",
      });

      if (res.verification?.passed) {
        setStatusLog(`Attestation verified! Settle Tx: ${res.verification?.settleTx?.slice(0, 10)}…`);
      } else {
        setStatusLog(`Verifier rejected evidence: Coordinates outside target zone tolerance.`);
      }
      onEvidenceSubmitted();
    } catch (e: any) {
      setStatusLog(`Submission error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  // 10x10 Grid tiles
  const gridSize = 10;
  const gridRows = Array.from({ length: gridSize }, (_, r) => gridSize - r); // 10 down to 1
  const gridCols = Array.from({ length: gridSize }, (_, c) => c + 1); // 1 to 10

  return (
    <div className="rounded-xl border border-line bg-panel p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-line/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Navigation className="w-4 h-4 text-signal" />
            <span>Autonomous Robot Simulation Chamber</span>
          </h3>
          <p className="text-xs text-dim">
            Simulates Member 2 robot odometry · records coordinates and emits live evidence payload to verifier.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-dim">
            Selected Job: {selectedJobId ? `${selectedJobId.slice(0, 8)}…` : "None"}
          </span>
        </div>
      </div>

      {/* Grid Canvas and Telemetry View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 10x10 Visual Map (7 cols) */}
        <div className="lg:col-span-7 rounded-xl border border-line bg-ink p-4 flex flex-col items-center justify-center">
          <div className="flex items-center justify-between w-full mb-3 text-[10px] font-mono text-dim">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-signal/20 border border-signal" /> Depot (1, 1)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-ok/20 border border-ok" /> Target Zone ({targetX}, {targetY})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-signal animate-ping" /> Robot M-042
            </span>
          </div>

          {/* Grid View */}
          <div className="inline-grid grid-cols-10 gap-1 bg-[#101714] p-2 rounded-lg border border-line/50">
            {gridRows.map((y) =>
              gridCols.map((x) => {
                const isRobot = posX === x && posY === y;
                const isTarget = targetX === x && targetY === y;
                const isDepot = x === 1 && y === 1;
                const isTrailed = historyTrail.some((t) => t.x === x && t.y === y);

                return (
                  <div
                    key={`${x}-${y}`}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded flex items-center justify-center text-[9px] font-mono transition-all duration-150 relative ${
                      isRobot
                        ? "bg-signal text-ink font-bold shadow-[0_0_12px_rgba(255,176,46,0.6)] z-10 scale-105"
                        : isTarget
                        ? "bg-ok/20 border border-ok text-ok font-bold"
                        : isDepot
                        ? "bg-line/40 border border-dim/40 text-dim"
                        : isTrailed
                        ? "bg-signal/10 border border-signal/30 text-signal/40"
                        : "bg-panel/40 border border-line/20 text-dim/30 hover:border-line"
                    }`}
                  >
                    {isRobot ? (
                      <Cpu className="w-4 h-4 animate-spin" />
                    ) : isTarget ? (
                      "T"
                    ) : isDepot ? (
                      "S"
                    ) : (
                      <span className="opacity-40">{`${x},${y}`}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Live Telemetry Readout & Controls (5 cols) */}
        <div className="lg:col-span-5 rounded-xl border border-line bg-panel p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              On-Board Telemetry Readout
            </h4>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-ink border border-line">
                <span className="text-dim text-[10px] block">Robot Position</span>
                <span className="text-white font-bold text-sm">({posX}, {posY})</span>
              </div>

              <div className="p-2.5 rounded-lg bg-ink border border-line">
                <span className="text-dim text-[10px] block">Target Zone</span>
                <span className="text-ok font-bold text-sm">({targetX}, {targetY})</span>
              </div>

              <div className="p-2.5 rounded-lg bg-ink border border-line">
                <span className="text-dim text-[10px] block">Distance Delta</span>
                <span className="text-signal font-bold text-sm">{distance} m</span>
              </div>

              <div className="p-2.5 rounded-lg bg-ink border border-line">
                <span className="text-dim text-[10px] block">Delivery Status</span>
                <span className={`font-bold text-sm ${isDelivered ? "text-ok" : "text-dim"}`}>
                  {isDelivered ? "DELIVERED" : isMoving ? "IN-TRANSIT" : "DEPOT"}
                </span>
              </div>
            </div>

            {/* Simulated Payload Preview */}
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-dim uppercase">Sensor Evidence Package:</span>
              <pre className="p-2 rounded bg-ink border border-line text-[10px] font-mono text-ok overflow-x-auto">
                {JSON.stringify(
                  {
                    packageId: DEFAULT_EVIDENCE_TARGET.packageId,
                    target: { zone: "green", x: targetX, y: targetY },
                    finalPosition: { x: posX, y: posY },
                    delivered: isDelivered,
                  },
                  null,
                  2
                )}
              </pre>
            </div>

            {/* Status log line */}
            <div className="p-2 rounded bg-ink border border-line/60 text-[11px] font-mono text-signal">
              › {statusLog}
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="space-y-2 pt-2 border-t border-line/60">
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={isMoving}
                onClick={() => startSimulation("success")}
                className="py-1.5 px-3 rounded-lg bg-ok text-ink font-bold text-xs hover:brightness-110 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-ink" />
                <span>Simulate Delivery</span>
              </button>

              <button
                disabled={isMoving}
                onClick={() => startSimulation("fail")}
                className="py-1.5 px-3 rounded-lg bg-bad text-white font-bold text-xs hover:brightness-110 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 shadow-sm"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Simulate Failure</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={isMoving}
                onClick={handleReset}
                className="py-1.5 px-3 rounded-lg border border-line bg-ink text-dim hover:text-white font-semibold text-xs disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Depot</span>
              </button>

              <button
                disabled={isMoving || busy || !selectedJobId}
                onClick={handleSubmitEvidence}
                className="py-1.5 px-3 rounded-lg bg-signal text-ink font-bold text-xs hover:brightness-110 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{busy ? "Signing..." : "Send to Verifier"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
