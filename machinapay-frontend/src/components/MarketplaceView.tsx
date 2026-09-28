import React, { useState, useEffect } from "react";
import { formatEther, parseEther, encodeBytes32String, decodeBytes32String, keccak256, toUtf8Bytes } from "ethers";
import {
  Bot,
  Cpu,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Zap,
  Lock,
  Award,
  DollarSign,
  X,
  Copy,
  Check,
} from "lucide-react";
import { cfg, NATIVE_SYMBOL } from "../lib/config";
import { getReadProvider, getRegistry, getEscrow, decodeContractError } from "../lib/wallet";
import { getMachineProfile, MachineProfile } from "../lib/machineProfiles";
import { quoteTransport, quoteSorting, QuoteResult } from "../lib/pricing";

export interface OnChainMachineData {
  idStr: string;
  idBytes32: string;
  wallet: string;
  signer: string;
  owner: string;
  active: boolean;
  stake: string;
  reputation: number;
  jobsCompleted: number;
  jobsFailed: number;
  status: "Available" | "Busy" | "Inactive";
  profile: MachineProfile;
  currentQuote: QuoteResult;
}

interface MarketplaceViewProps {
  signer: any;
  clientAddress: string | null;
  onOpenPricingDashboard: () => void;
  onJobCreated?: (jobId: string) => void;
}

export function MarketplaceView({
  signer,
  clientAddress,
  onOpenPricingDashboard,
  onJobCreated,
}: MarketplaceViewProps) {
  const [machines, setMachines] = useState<OnChainMachineData[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Hire Machine Modal State
  const [hiringMachine, setHiringMachine] = useState<OnChainMachineData | null>(null);
  const [hireDescription, setHireDescription] = useState<string>("");
  const [hireDurationMinutes, setHireDurationMinutes] = useState<string>("60");

  // Dynamic pricing inputs for the hire form
  // Transport inputs
  const [distanceKm, setDistanceKm] = useState<number>(5);
  const [weightKg, setWeightKg] = useState<number>(10);
  const [transportUrgency, setTransportUrgency] = useState<"STANDARD" | "PRIORITY" | "URGENT">("PRIORITY");

  // Sorting inputs
  const [objectCount, setObjectCount] = useState<number>(100);
  const [colorCount, setColorCount] = useState<number>(4);
  const [accuracyThreshold, setAccuracyThreshold] = useState<number>(95);
  const [sortingUrgency, setSortingUrgency] = useState<"STANDARD" | "PRIORITY" | "URGENT">("PRIORITY");

  const [hireSubmitting, setHireSubmitting] = useState<boolean>(false);
  const [hireError, setHireError] = useState<string | null>(null);
  const [hireTxStatus, setHireTxStatus] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function copyText(key: string, val: string) {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  // Load all machines directly from MachineRegistry and check status against JobEscrow
  async function loadMachines() {
    setLoading(true);
    setError(null);
    try {
      const provider = getReadProvider();
      const registry = getRegistry(provider);
      const escrow = getEscrow(provider);

      const rawIds: string[] = await registry.getMachineIds().catch(() => []);
      setTotalCount(rawIds.length);

      // Read total jobs in escrow to determine open/funded jobs and busy machines
      const totalJobs = Number(await escrow.jobCount().catch(() => 0));
      const busyMachineIds = new Set<string>();
      let openJobsCount = 0;

      if (totalJobs > 0) {
        const offset = Math.max(0, totalJobs - 50);
        const recentJobIds: string[] = await escrow.getJobIds(offset, totalJobs - offset).catch(() => []);
        for (const jId of recentJobIds) {
          const j = await escrow.getJob(jId).catch(() => null);
          if (!j) continue;
          const state = Number(j.state);
          if (state === 1) {
            openJobsCount++;
          } else if (state === 2 || state === 3 || state === 4) {
            // ACCEPTED (2), EXECUTING (3), PROOF_SUBMITTED (4)
            try {
              const mText = decodeBytes32String(j.machineId);
              if (mText) busyMachineIds.add(mText);
            } catch {
              // ignore
            }
          }
        }
      }

      let activeTotal = 0;
      const loaded: OnChainMachineData[] = [];

      for (const idBytes of rawIds) {
        let idStr = "";
        try {
          idStr = decodeBytes32String(idBytes);
        } catch {
          idStr = idBytes.slice(0, 8);
        }
        if (!idStr) continue;

        const info = await registry.getMachine(idBytes).catch(() => null);
        if (!info) continue;

        if (info.active) activeTotal++;

        const isBusy = busyMachineIds.has(idStr);
        let status: "Available" | "Busy" | "Inactive" = "Inactive";
        if (info.active) {
          status = isBusy ? "Busy" : "Available";
        }

        const profile = getMachineProfile(idStr);

        // Generate live quote based on job type with default inputs
        const quote =
          profile.jobType === "COLOR_SORTING"
            ? quoteSorting({
                objectCount: 100,
                colorCount: 4,
                accuracyThreshold: 95,
                urgency: "PRIORITY",
                openJobsCount,
                availableMachinesCount: activeTotal,
              })
            : quoteTransport({
                distanceKm: 5,
                weightKg: 10,
                urgency: "PRIORITY",
                openJobsCount,
                availableMachinesCount: activeTotal,
              });

        loaded.push({
          idStr,
          idBytes32: idBytes,
          wallet: info.wallet,
          signer: info.signer,
          owner: info.owner,
          active: Boolean(info.active),
          stake: formatEther(info.stake),
          reputation: Number(info.reputation),
          jobsCompleted: Number(info.jobsCompleted),
          jobsFailed: Number(info.jobsFailed),
          status,
          profile,
          currentQuote: quote,
        });
      }

      setActiveCount(activeTotal);
      setMachines(loaded);
      setLoading(false);
    } catch (err: any) {
      console.error("Failed to load marketplace machines:", err);
      setError(err.message || String(err));
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMachines();
  }, []);

  // Update dynamically from real contract events (escrow.on / registry.on)
  useEffect(() => {
    let provider: any;
    try {
      provider = getReadProvider();
    } catch {
      return;
    }
    const registry = getRegistry(provider);
    const escrow = getEscrow(provider);

    const onUpdate = () => {
      loadMachines();
    };

    registry.on("MachineRegistered", onUpdate);
    registry.on("MachineReputationUpdated", onUpdate);
    escrow.on("JobAccepted", onUpdate);
    escrow.on("PaymentReleased", onUpdate);
    escrow.on("JobRefunded", onUpdate);

    return () => {
      registry.off("MachineRegistered", onUpdate);
      registry.off("MachineReputationUpdated", onUpdate);
      escrow.off("JobAccepted", onUpdate);
      escrow.off("PaymentReleased", onUpdate);
      escrow.off("JobRefunded", onUpdate);
    };
  }, []);

  // Open Hire Machine modal with appropriate default description
  function handleOpenHire(machine: OnChainMachineData) {
    setHiringMachine(machine);
    setHireError(null);
    setHireTxStatus(null);
    setHireDescription(
      machine.profile.jobType === "COLOR_SORTING"
        ? "Sort 100 objects into 4 color bins"
        : "Move 10kg package from Warehouse A to Warehouse B"
    );
  }

  // Calculate live quote in modal
  function getModalQuote(): QuoteResult {
    if (!hiringMachine) return { total: 0, factors: [] };
    if (hiringMachine.profile.jobType === "COLOR_SORTING") {
      return quoteSorting({
        objectCount,
        colorCount,
        accuracyThreshold,
        urgency: sortingUrgency,
      });
    }
    return quoteTransport({
      distanceKm,
      weightKg,
      urgency: transportUrgency,
    });
  }

  // Submit on-chain createJob
  async function handleSubmitHire(e: React.FormEvent) {
    e.preventDefault();
    if (!signer) {
      setHireError("Connect your wallet first.");
      return;
    }
    if (!hiringMachine) return;

    setHireSubmitting(true);
    setHireError(null);
    setHireTxStatus("Awaiting wallet approval…");

    let escrow: any;
    try {
      escrow = getEscrow(signer);
      const quote = getModalQuote();
      const jobId = keccak256(toUtf8Bytes(`job-${Date.now()}-${hiringMachine.idStr}`));
      const durationSeconds = Math.max(60, Number(hireDurationMinutes) * 60);

      // Register off-chain metadata
      let metadataHash = keccak256(toUtf8Bytes(hireDescription));
      try {
        const metaRes = await fetch("http://localhost:4000/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskType: hiringMachine.profile.jobType,
            machineId: hiringMachine.idStr,
            description: hireDescription,
            pricing: quote,
          }),
        });
        if (metaRes.ok) {
          const mJson = await metaRes.json();
          if (mJson.metadataHash) metadataHash = mJson.metadataHash;
        }
      } catch {
        // Fallback
      }

      setHireTxStatus(`Funding escrow with ${quote.total} ${NATIVE_SYMBOL}…`);
      const tx = await escrow.createJob(jobId, metadataHash, durationSeconds, hireDescription, {
        value: parseEther(quote.total.toString()),
      });

      setHireTxStatus(`Mining transaction (${tx.hash.slice(0, 10)}…)`);
      await tx.wait();

      setHiringMachine(null);
      if (onJobCreated) onJobCreated(jobId);
      loadMachines();
    } catch (err: any) {
      console.error("Failed to hire machine:", err);
      setHireError(decodeContractError(err, escrow));
    } finally {
      setHireSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 font-sans">
      {/* 1. Hero Banner: Light card with very soft blue/green tint, dark heading, text 2 lines max */}
      <div className="rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50/70 to-emerald-50/60 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-100/70 text-blue-700 text-[11px] font-semibold">
            <Zap className="w-3 h-3" />
            <span>Autonomous Machine Fleet</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            MachinaPay Machine Marketplace
          </h1>
          <p className="text-xs text-gray-600 leading-normal">
            Hire autonomous hardware on-chain. Quotes are computed dynamically in the frontend and locked into JobEscrow upon funding.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenPricingDashboard}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors shadow-xs"
          >
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            <span>Pricing Formulas</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span>Error connecting to MachineRegistry: {error}</span>
          </div>
          <button onClick={loadMachines} className="underline font-semibold hover:text-red-900">
            Retry
          </button>
        </div>
      )}

      {/* 2. Machine Fleet Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900 font-mono">
            Registered Autonomous Machines
          </h2>
          <p className="text-xs text-gray-500">
            Real on-chain data from MachineRegistry.sol
          </p>
        </div>
        <div className="text-xs font-mono text-gray-600">
          <span className="font-semibold text-gray-900">{activeCount}</span> active / {totalCount} total
        </div>
      </div>

      {/* 3. Machine Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4 animate-pulse">
              <div className="h-6 w-32 bg-gray-200 rounded" />
              <div className="h-16 bg-gray-100 rounded" />
              <div className="h-8 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      ) : machines.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center space-y-2">
          <Bot className="w-10 h-10 text-gray-400 mx-auto" />
          <h3 className="text-sm font-bold text-gray-900">No machines registered yet.</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Use the deploy or seed scripts to register autonomous machines with staked collateral in MachineRegistry.sol.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {machines.map((machine) => {
            const isAvailable = machine.status === "Available";
            const canHire = isAvailable && Boolean(clientAddress);

            return (
              <div
                key={machine.idStr}
                className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col justify-between shadow-xs hover:border-gray-300 transition-all"
              >
                <div className="space-y-4">
                  {/* Top Bar: Icon, Name, Status Badge, Reputation */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-700">
                        {machine.profile.jobType === "COLOR_SORTING" ? (
                          <Cpu className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <Bot className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold font-mono text-gray-900">
                            {machine.idStr}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              machine.status === "Available"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : machine.status === "Busy"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-gray-100 text-gray-600 border-gray-200"
                            }`}
                          >
                            {machine.status}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-gray-900 mt-0.5">
                          {machine.profile.name}
                        </h3>
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <span className="text-[10px] text-gray-500 uppercase">Reputation</span>
                      <div className="text-base font-bold text-gray-900 flex items-center gap-1 justify-end">
                        <Award className="w-3.5 h-3.5 text-amber-500" />
                        <span>{machine.reputation}</span>
                      </div>
                    </div>
                  </div>

                  {/* Capability Details */}
                  <div className="p-3.5 rounded bg-[#f6f7f9] border border-gray-200 space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Capability:</span>
                      <span className="text-gray-900 font-medium">{machine.profile.capability}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Mission:</span>
                      <span className="text-gray-900 font-medium">{machine.profile.mission}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Jobs Completed / Failed:</span>
                      <span className="text-gray-900 font-medium">
                        {machine.jobsCompleted} / {machine.jobsFailed}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Staked Collateral:</span>
                      <span className="text-gray-900 font-medium">
                        {machine.stake} {NATIVE_SYMBOL}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                      <span className="text-gray-500">Operator Wallet:</span>
                      <div className="flex items-center gap-1.5 text-gray-700">
                        <span>{machine.wallet.slice(0, 6)}…{machine.wallet.slice(-4)}</span>
                        <button
                          onClick={() => copyText(machine.idStr, machine.wallet)}
                          className="hover:text-gray-900"
                        >
                          {copiedKey === machine.idStr ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Live Quote Box */}
                  <div className="p-3 rounded bg-white border border-gray-200 flex items-center justify-between font-mono text-xs">
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase block">Live Quote</span>
                      <span className="text-gray-700 font-medium">
                        {machine.profile.jobType === "COLOR_SORTING"
                          ? "100 objects, 4 colors, 95% SLA"
                          : "5 km, 10 kg, Priority"}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-bold text-emerald-600">
                        {machine.currentQuote.total} {NATIVE_SYMBOL}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
                  <div className="text-[11px] text-gray-500 font-mono">
                    {machine.jobsCompleted} completed jobs
                  </div>

                  <button
                    onClick={() => handleOpenHire(machine)}
                    disabled={!canHire}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold font-mono transition-colors shadow-xs ${
                      canHire
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                    }`}
                  >
                    <span>Hire Machine</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Hire Machine Modal */}
      {hiringMachine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in font-mono">
          <div className="w-full max-w-lg rounded-lg border border-gray-200 bg-white shadow-xl p-6 relative max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setHiringMachine(null)}
              className="absolute top-4 right-4 p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-900">{hiringMachine.idStr}</span>
                <span className="text-[10px] text-gray-500">{hiringMachine.profile.jobType}</span>
              </div>
              <h2 className="text-base font-bold text-gray-900 tracking-tight mt-0.5">
                Hire {hiringMachine.profile.name}
              </h2>
              <p className="text-xs text-gray-500">
                Lock native funds into JobEscrow.sol. Reward is locked permanently upon funding.
              </p>
            </div>

            <form onSubmit={handleSubmitHire} className="space-y-4 text-xs">
              <div>
                <label className="text-gray-600 text-[10px] uppercase font-bold">Job Description</label>
                <input
                  type="text"
                  value={hireDescription}
                  onChange={(e) => setHireDescription(e.target.value)}
                  disabled={hireSubmitting}
                  className="w-full mt-1 px-3 py-2 rounded border border-gray-200 bg-gray-50 text-gray-900 outline-none focus:border-blue-500 font-sans"
                />
              </div>

              {/* Job-Specific Pricing Inputs */}
              {hiringMachine.profile.jobType === "COLOR_SORTING" ? (
                <div className="p-3 rounded bg-[#f6f7f9] border border-gray-200 space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-bold text-gray-700 uppercase">
                    <span>Sorting Parameters</span>
                    <span className="text-emerald-600 font-normal">Pricing Factors</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-gray-500 text-[10px]">Object Count</label>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={objectCount}
                        onChange={(e) => setObjectCount(Number(e.target.value))}
                        disabled={hireSubmitting}
                        className="w-full mt-0.5 px-2 py-1.5 rounded border border-gray-200 bg-white text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 text-[10px]">Color Bins</label>
                      <input
                        type="number"
                        min="1"
                        max="8"
                        value={colorCount}
                        onChange={(e) => setColorCount(Number(e.target.value))}
                        disabled={hireSubmitting}
                        className="w-full mt-0.5 px-2 py-1.5 rounded border border-gray-200 bg-white text-gray-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-gray-500 text-[10px]">Required Accuracy (%)</label>
                      <input
                        type="number"
                        min="80"
                        max="99"
                        value={accuracyThreshold}
                        onChange={(e) => setAccuracyThreshold(Number(e.target.value))}
                        disabled={hireSubmitting}
                        className="w-full mt-0.5 px-2 py-1.5 rounded border border-gray-200 bg-white text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 text-[10px]">Urgency</label>
                      <select
                        value={sortingUrgency}
                        onChange={(e) => setSortingUrgency(e.target.value as any)}
                        disabled={hireSubmitting}
                        className="w-full mt-0.5 px-2 py-1.5 rounded border border-gray-200 bg-white text-gray-900"
                      >
                        <option value="STANDARD">STANDARD</option>
                        <option value="PRIORITY">PRIORITY (+10)</option>
                        <option value="URGENT">URGENT (+20)</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded bg-[#f6f7f9] border border-gray-200 space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-bold text-gray-700 uppercase">
                    <span>Transport Parameters</span>
                    <span className="text-blue-600 font-normal">Pricing Factors</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-gray-500 text-[10px]">Distance (km)</label>
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={distanceKm}
                        onChange={(e) => setDistanceKm(Number(e.target.value))}
                        disabled={hireSubmitting}
                        className="w-full mt-0.5 px-2 py-1.5 rounded border border-gray-200 bg-white text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 text-[10px]">Weight (kg)</label>
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={weightKg}
                        onChange={(e) => setWeightKg(Number(e.target.value))}
                        disabled={hireSubmitting}
                        className="w-full mt-0.5 px-2 py-1.5 rounded border border-gray-200 bg-white text-gray-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-gray-500 text-[10px]">Urgency</label>
                    <select
                      value={transportUrgency}
                      onChange={(e) => setTransportUrgency(e.target.value as any)}
                      disabled={hireSubmitting}
                      className="w-full mt-0.5 px-2 py-1.5 rounded border border-gray-200 bg-white text-gray-900"
                    >
                      <option value="STANDARD">STANDARD</option>
                      <option value="PRIORITY">PRIORITY (+10)</option>
                      <option value="URGENT">URGENT (+20)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Duration */}
              <div>
                <label className="text-gray-600 text-[10px] uppercase font-bold">
                  Duration (Minutes until Expiry)
                </label>
                <input
                  type="number"
                  value={hireDurationMinutes}
                  onChange={(e) => setHireDurationMinutes(e.target.value)}
                  disabled={hireSubmitting}
                  className="w-full mt-1 px-3 py-2 rounded border border-gray-200 bg-gray-50 text-gray-900 outline-none focus:border-blue-500"
                />
              </div>

              {/* Dynamic Quote Breakdown */}
              {(() => {
                const quote = getModalQuote();
                return (
                  <div className="p-3.5 rounded bg-gray-50 border border-gray-200 space-y-2">
                    <div className="flex justify-between items-baseline border-b border-gray-200 pb-2">
                      <span className="text-xs font-bold text-gray-900 uppercase">Calculated Quote:</span>
                      <span className="text-base font-bold text-emerald-600">
                        {quote.total} {NATIVE_SYMBOL}
                      </span>
                    </div>

                    <div className="space-y-1 text-[11px] text-gray-600">
                      {quote.factors.map((f, i) => (
                        <div key={i} className="flex justify-between">
                          <span>{f.label}:</span>
                          <span className="font-semibold text-gray-800">+{f.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {hireTxStatus && (
                <div className="p-2 rounded bg-blue-50 border border-blue-200 text-blue-800 text-[11px]">
                  {hireTxStatus}
                </div>
              )}

              {hireError && (
                <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-[11px]">
                  {hireError}
                </div>
              )}

              <button
                type="submit"
                disabled={hireSubmitting || !signer}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs transition-colors shadow-xs"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>
                  {hireSubmitting
                    ? "Locking Funds in Escrow…"
                    : `Lock ${getModalQuote().total} ${NATIVE_SYMBOL} & Hire Machine`}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
