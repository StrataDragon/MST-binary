import React, { useState, useEffect, useMemo } from "react";
import {
  Download,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Fuel,
  Lock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowUpDown,
  RefreshCw,
  AlertTriangle,
  Layers
} from "lucide-react";
import { ethers } from "ethers";
import { getContractConfig, NATIVE_SYMBOL } from "../lib/config";

interface SettledJobDetail {
  jobId: string;
  machineId: string;
  isPaid: boolean;
  refundReason?: string;
  createdTime: number;
  proofTime?: number;
  settledTime: number;
  settlementDuration: number;
  proofToReleaseDuration?: number;
  gasUsed: bigint;
  gasCostNative: number;
}

interface MachineStats {
  machineId: string;
  paidCount: number;
  refundedCount: number;
  totalSettled: number;
  successRate: number;
  avgDurationSec: number;
  reputation: number;
  jobsCompletedOnChain: number;
  jobsFailedOnChain: number;
}

interface DailyOutcome {
  dateStr: string; // YYYY-MM-DD
  dayLabel: string;
  paid: number;
  refunded: number;
  total: number;
  successRate: number | null; // null if no settlements (gap)
}

export function SettlementAnalyticsView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [settledJobs, setSettledJobs] = useState<SettledJobDetail[]>([]);
  const [totalLocked, setTotalLocked] = useState<string>("0");
  const [verifierFailCount, setVerifierFailCount] = useState<number>(0);
  const [verifierTotalCount, setVerifierTotalCount] = useState<number>(0);
  const [refundReasons, setRefundReasons] = useState<{ [reason: string]: number }>({
    CUSTOMER_CANCELLED: 0,
    EXPIRED: 0,
    VERIFICATION_FAILED: 0,
  });
  const [machineStatsList, setMachineStatsList] = useState<MachineStats[]>([]);
  const [sortField, setSortField] = useState<keyof MachineStats>("totalSettled");
  const [sortAsc, setSortAsc] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<DailyOutcome | null>(null);

  const fetchSettlementData = async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = getContractConfig();
      const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
      const escrow = new ethers.Contract(cfg.escrowAddress, cfg.escrowAbi, provider);
      const registry = new ethers.Contract(cfg.registryAddress, cfg.registryAbi, provider);

      // 1. Total locked
      try {
        const locked = await escrow.totalLocked();
        setTotalLocked(ethers.formatEther(locked));
      } catch (e) {
        console.warn("Could not fetch totalLocked:", e);
      }

      // Query recent events (past 5000 blocks)
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 5000);

      const [
        createdLogs,
        proofLogs,
        verifiedLogs,
        releasedLogs,
        refundedLogs,
      ] = await Promise.all([
        escrow.queryFilter(escrow.filters.JobCreated(), fromBlock, "latest").catch(() => []),
        escrow.queryFilter(escrow.filters.ProofSubmitted(), fromBlock, "latest").catch(() => []),
        escrow.queryFilter(escrow.filters.VerificationSubmitted(), fromBlock, "latest").catch(() => []),
        escrow.queryFilter(escrow.filters.PaymentReleased(), fromBlock, "latest").catch(() => []),
        escrow.queryFilter(escrow.filters.JobRefunded(), fromBlock, "latest").catch(() => []),
      ]);

      // Cache block timestamps
      const blockTimestampCache = new Map<number, number>();
      const getTimestamp = async (bNum: number) => {
        if (blockTimestampCache.has(bNum)) return blockTimestampCache.get(bNum)!;
        try {
          const b = await provider.getBlock(bNum);
          const t = b?.timestamp || Math.floor(Date.now() / 1000);
          blockTimestampCache.set(bNum, t);
          return t;
        } catch {
          return Math.floor(Date.now() / 1000);
        }
      };

      // Map created jobs
      const jobCreatedMap = new Map<string, { machineId: string; blockNumber: number; timestamp: number }>();
      for (const log of createdLogs) {
        if ("args" in log && log.args) {
          const jobId = String(log.args[0]);
          let machineId = "UNKNOWN";
          try {
            machineId = ethers.decodeBytes32String(log.args[2]);
          } catch {
            machineId = String(log.args[2]).slice(0, 10);
          }
          const t = await getTimestamp(log.blockNumber);
          jobCreatedMap.set(jobId, { machineId, blockNumber: log.blockNumber, timestamp: t });
        }
      }

      // Map proof submissions
      const jobProofMap = new Map<string, number>();
      for (const log of proofLogs) {
        if ("args" in log && log.args) {
          const jobId = String(log.args[0]);
          const t = await getTimestamp(log.blockNumber);
          jobProofMap.set(jobId, t);
        }
      }

      // Verifier fail metrics
      let verifierTotal = 0;
      let verifierFails = 0;
      for (const log of verifiedLogs) {
        if ("args" in log && log.args) {
          verifierTotal++;
          const passed = Boolean(log.args[1]);
          if (!passed) verifierFails++;
        }
      }
      setVerifierTotalCount(verifierTotal);
      setVerifierFailCount(verifierFails);

      // Refund reasons & logs
      const reasonsCount = {
        CUSTOMER_CANCELLED: 0,
        EXPIRED: 0,
        VERIFICATION_FAILED: 0,
      };

      const settledList: SettledJobDetail[] = [];

      // Process PaymentReleased
      for (const log of releasedLogs) {
        if ("args" in log && log.args) {
          const jobId = String(log.args[0]);
          const createdInfo = jobCreatedMap.get(jobId);
          const settledTime = await getTimestamp(log.blockNumber);
          const createdTime = createdInfo?.timestamp || settledTime;
          const proofTime = jobProofMap.get(jobId);

          let gasUsed = BigInt(0);
          let gasCost = 0;
          try {
            const receipt = await provider.getTransactionReceipt(log.transactionHash);
            if (receipt) {
              gasUsed = receipt.gasUsed;
              const gasPrice = receipt.gasPrice ?? BigInt(1000000000);
              gasCost = parseFloat(ethers.formatEther(gasUsed * gasPrice));
            }
          } catch {}

          settledList.push({
            jobId,
            machineId: createdInfo?.machineId || "M-UNKNOWN",
            isPaid: true,
            createdTime,
            proofTime,
            settledTime,
            settlementDuration: Math.max(0, settledTime - createdTime),
            proofToReleaseDuration: proofTime ? Math.max(0, settledTime - proofTime) : undefined,
            gasUsed,
            gasCostNative: gasCost,
          });
        }
      }

      // Process JobRefunded
      const reasonNames = ["CUSTOMER_CANCELLED", "EXPIRED", "VERIFICATION_FAILED"];
      for (const log of refundedLogs) {
        if ("args" in log && log.args) {
          const jobId = String(log.args[0]);
          const reasonNum = Number(log.args[3] || 0);
          const reasonName = reasonNames[reasonNum] || "CUSTOMER_CANCELLED";
          if (reasonName in reasonsCount) {
            reasonsCount[reasonName as keyof typeof reasonsCount]++;
          }

          const createdInfo = jobCreatedMap.get(jobId);
          const settledTime = await getTimestamp(log.blockNumber);
          const createdTime = createdInfo?.timestamp || settledTime;

          let gasUsed = BigInt(0);
          let gasCost = 0;
          try {
            const receipt = await provider.getTransactionReceipt(log.transactionHash);
            if (receipt) {
              gasUsed = receipt.gasUsed;
              const gasPrice = receipt.gasPrice ?? BigInt(1000000000);
              gasCost = parseFloat(ethers.formatEther(gasUsed * gasPrice));
            }
          } catch {}

          settledList.push({
            jobId,
            machineId: createdInfo?.machineId || "M-UNKNOWN",
            isPaid: false,
            refundReason: reasonName,
            createdTime,
            settledTime,
            settlementDuration: Math.max(0, settledTime - createdTime),
            gasUsed,
            gasCostNative: gasCost,
          });
        }
      }

      setRefundReasons(reasonsCount);
      setSettledJobs(settledList);

      // 4. Per-machine breakdown
      const machinesMap = new Map<string, {
        paid: number;
        refunded: number;
        totalDuration: number;
        durationCount: number;
      }>();

      for (const job of settledList) {
        const entry = machinesMap.get(job.machineId) || { paid: 0, refunded: 0, totalDuration: 0, durationCount: 0 };
        if (job.isPaid) entry.paid++;
        else entry.refunded++;
        entry.totalDuration += job.settlementDuration;
        entry.durationCount++;
        machinesMap.set(job.machineId, entry);
      }

      // Get machine IDs from registry to include all registered machines
      let allMachineIds: string[] = [];
      try {
        const rawIds = await registry.getMachineIds();
        allMachineIds = rawIds.map((id: string) => {
          try {
            return ethers.decodeBytes32String(id);
          } catch {
            return id;
          }
        });
      } catch {}

      // Combine with machine IDs found in jobs
      for (const mId of machinesMap.keys()) {
        if (!allMachineIds.includes(mId)) allMachineIds.push(mId);
      }

      const stats: MachineStats[] = [];
      for (const mId of allMachineIds) {
        let rep = 100;
        let onChainCompleted = 0;
        let onChainFailed = 0;
        try {
          const bytesId = ethers.encodeBytes32String(mId);
          const onChain = await registry.getMachine(bytesId);
          rep = Number(onChain.reputation);
          onChainCompleted = Number(onChain.jobsCompleted);
          onChainFailed = Number(onChain.jobsFailed);
        } catch {}

        const entry = machinesMap.get(mId) || { paid: 0, refunded: 0, totalDuration: 0, durationCount: 0 };
        const total = entry.paid + entry.refunded;
        const rate = total > 0 ? (entry.paid / total) * 100 : 100;
        const avgDur = entry.durationCount > 0 ? entry.totalDuration / entry.durationCount : 0;

        stats.push({
          machineId: mId,
          paidCount: entry.paid,
          refundedCount: entry.refunded,
          totalSettled: total,
          successRate: rate,
          avgDurationSec: Math.round(avgDur),
          reputation: rep,
          jobsCompletedOnChain: onChainCompleted,
          jobsFailedOnChain: onChainFailed,
        });
      }

      setMachineStatsList(stats);
    } catch (err: any) {
      console.error("Settlement analytics fetch error:", err);
      setError(err?.message || "Failed to query settlement events from RPC.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettlementData();

    // Event-driven live update
    try {
      const cfg = getContractConfig();
      const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
      const escrow = new ethers.Contract(cfg.escrowAddress, cfg.escrowAbi, provider);

      const onSettled = () => {
        fetchSettlementData();
      };

      escrow.on("PaymentReleased", onSettled);
      escrow.on("JobRefunded", onSettled);
      escrow.on("VerificationSubmitted", onSettled);

      return () => {
        escrow.off("PaymentReleased", onSettled);
        escrow.off("JobRefunded", onSettled);
        escrow.off("VerificationSubmitted", onSettled);
      };
    } catch (e) {
      console.warn("Could not set up live settlement listeners", e);
    }
  }, []);

  // Aggregated Summary Metrics
  const paidCount = useMemo(() => settledJobs.filter((j) => j.isPaid).length, [settledJobs]);
  const refundedCount = useMemo(() => settledJobs.filter((j) => !j.isPaid).length, [settledJobs]);
  const totalSettledCount = paidCount + refundedCount;
  const overallSuccessRate = totalSettledCount > 0 ? (paidCount / totalSettledCount) * 100 : 0;

  const avgSettlementTimeSec = useMemo(() => {
    if (settledJobs.length === 0) return 0;
    const totalSec = settledJobs.reduce((acc, j) => acc + j.settlementDuration, 0);
    return Math.round(totalSec / settledJobs.length);
  }, [settledJobs]);

  const avgProofToReleaseSec = useMemo(() => {
    const proofToReleaseJobs = settledJobs.filter((j) => j.proofToReleaseDuration !== undefined);
    if (proofToReleaseJobs.length === 0) return 0;
    const total = proofToReleaseJobs.reduce((acc, j) => acc + (j.proofToReleaseDuration || 0), 0);
    return Math.round(total / proofToReleaseJobs.length);
  }, [settledJobs]);

  const avgGasUsed = useMemo(() => {
    if (settledJobs.length === 0) return BigInt(0);
    const sum = settledJobs.reduce((acc, j) => acc + j.gasUsed, BigInt(0));
    return sum / BigInt(settledJobs.length);
  }, [settledJobs]);

  const avgGasCostNative = useMemo(() => {
    if (settledJobs.length === 0) return 0;
    const sum = settledJobs.reduce((acc, j) => acc + j.gasCostNative, 0);
    return sum / settledJobs.length;
  }, [settledJobs]);

  const verifierFailRate = useMemo(() => {
    if (verifierTotalCount === 0) return 0;
    return (verifierFailCount / verifierTotalCount) * 100;
  }, [verifierTotalCount, verifierFailCount]);

  // Last 30 days outcomes chart data
  const dailyOutcomes: DailyOutcome[] = useMemo(() => {
    const daysMap = new Map<string, { paid: number; refunded: number }>();
    const now = new Date();

    // Initialize 30 calendar days
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = d.toISOString().split("T")[0];
      daysMap.set(key, { paid: 0, refunded: 0 });
    }

    for (const job of settledJobs) {
      const d = new Date(job.settledTime * 1000);
      const key = d.toISOString().split("T")[0];
      if (daysMap.has(key)) {
        const entry = daysMap.get(key)!;
        if (job.isPaid) entry.paid++;
        else entry.refunded++;
      }
    }

    const result: DailyOutcome[] = [];
    daysMap.forEach((val, dateStr) => {
      const total = val.paid + val.refunded;
      const rate = total > 0 ? (val.paid / total) * 100 : null; // Gap if 0 settlements
      const d = new Date(dateStr);
      const dayLabel = `${d.getMonth() + 1}/${d.getDate()}`;
      result.push({
        dateStr,
        dayLabel,
        paid: val.paid,
        refunded: val.refunded,
        total,
        successRate: rate,
      });
    });

    return result;
  }, [settledJobs]);

  // Sortable Machine Stats
  const sortedMachineStats = useMemo(() => {
    const copy = [...machineStatsList];
    copy.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (typeof aVal === "string") {
        return sortAsc
          ? (aVal as string).localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal as string);
      }
      return sortAsc ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });
    return copy;
  }, [machineStatsList, sortField, sortAsc]);

  const handleSort = (field: keyof MachineStats) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (totalSettledCount === 0) return;

    let csv = "--- SETTLEMENT OUTCOMES (LAST 30 DAYS) ---\nDate,Paid Jobs,Refunded Jobs,Total Settled,Success Rate (%)\n";
    dailyOutcomes.forEach((d) => {
      csv += `${d.dateStr},${d.paid},${d.refunded},${d.total},${d.successRate !== null ? d.successRate.toFixed(1) : "GAP"}\n`;
    });

    csv += "\n--- MACHINE PERFORMANCE ---\nMachine ID,Paid Jobs,Refunded Jobs,Total Settled,Success Rate (%),Avg Settlement Time (s),Reputation\n";
    sortedMachineStats.forEach((m) => {
      csv += `${m.machineId},${m.paidCount},${m.refundedCount},${m.totalSettled},${m.successRate.toFixed(1)},${m.avgDurationSec},${m.reputation}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `machinapay-settlement-analytics-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 font-sans">
      {/* 1. Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            Settlement Analytics
          </h1>
          <p className="text-sm text-gray-600">
            Real settlement performance from on-chain jobs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchSettlementData}
            disabled={loading}
            className="p-2 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg text-gray-600 transition-colors shadow-xs"
            title="Refresh events from RPC"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={totalSettledCount === 0}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors ${
              totalSettledCount > 0
                ? "bg-gray-900 hover:bg-gray-800 text-white cursor-pointer"
                : "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>Error loading settlement data: {error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && settledJobs.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl border border-gray-200" />
          ))}
        </div>
      )}

      {/* 2. Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Jobs Settled */}
        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs space-y-1">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Jobs Settled</div>
          <div className="text-2xl font-bold font-mono text-gray-900">
            {totalSettledCount}
          </div>
          <div className="text-xs text-gray-500 flex gap-2 pt-0.5">
            <span className="text-emerald-600 font-medium">Paid: {paidCount}</span>
            <span>•</span>
            <span className="text-red-500 font-medium">Refunded: {refundedCount}</span>
          </div>
        </div>

        {/* Card 2: Success Rate */}
        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs space-y-1">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Success Rate</div>
          <div className="text-2xl font-bold font-mono text-emerald-600">
            {totalSettledCount > 0 ? `${overallSuccessRate.toFixed(1)}%` : "N/A"}
          </div>
          <div className="text-xs text-gray-500">
            {paidCount} of {totalSettledCount} completed
          </div>
        </div>

        {/* Card 3: Avg Settlement Time */}
        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs space-y-1">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Avg Settlement Time</div>
          <div className="text-2xl font-bold font-mono text-blue-600">
            {totalSettledCount > 0 ? `${avgSettlementTimeSec}s` : "N/A"}
          </div>
          <div className="text-xs text-gray-500">
            Proof → Release: {avgProofToReleaseSec > 0 ? `${avgProofToReleaseSec}s` : "—"}
          </div>
        </div>

        {/* Card 4: Avg Gas */}
        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs space-y-1">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Avg Gas per Job</div>
          <div className="text-2xl font-bold font-mono text-gray-900">
            {avgGasUsed > BigInt(0) ? `${Math.round(Number(avgGasUsed) / 1000)}k` : "—"}
          </div>
          <div className="text-xs text-gray-500 font-mono">
            {avgGasCostNative > 0 ? `${avgGasCostNative.toFixed(6)} ${NATIVE_SYMBOL}` : "—"}
          </div>
        </div>

        {/* Card 5: Total Locked */}
        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs space-y-1">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Locked</div>
          <div className="text-2xl font-bold font-mono text-purple-600">
            {totalLocked}
          </div>
          <div className="text-xs text-gray-500">
            In Escrow ({NATIVE_SYMBOL})
          </div>
        </div>
      </div>

      {/* 3. Operational Breakdown (Refund reasons & Verifier Fail Rate) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Refund Breakdown */}
        <div className="p-5 rounded-xl border border-gray-200 bg-white shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Refund Breakdown by Reason</h2>
            <span className="text-xs font-mono text-gray-500">{refundedCount} total refunds</span>
          </div>

          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Customer Cancelled</span>
                <span className="font-mono font-semibold text-gray-900">{refundReasons.CUSTOMER_CANCELLED}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-amber-500 h-2 rounded-full"
                  style={{
                    width: refundedCount > 0 ? `${(refundReasons.CUSTOMER_CANCELLED / refundedCount) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Expired (Deadline Passed)</span>
                <span className="font-mono font-semibold text-gray-900">{refundReasons.EXPIRED}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-purple-500 h-2 rounded-full"
                  style={{
                    width: refundedCount > 0 ? `${(refundReasons.EXPIRED / refundedCount) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Verification Failed</span>
                <span className="font-mono font-semibold text-gray-900">{refundReasons.VERIFICATION_FAILED}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-red-500 h-2 rounded-full"
                  style={{
                    width: refundedCount > 0 ? `${(refundReasons.VERIFICATION_FAILED / refundedCount) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Verifier Metrics */}
        <div className="p-5 rounded-xl border border-gray-200 bg-white shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Verifier Attestation Metrics</h2>
            <span className="text-xs font-mono text-gray-500">{verifierTotalCount} attestations</span>
          </div>

          <div className="p-4 rounded-lg bg-[#f6f7f9] border border-gray-200 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-600">Verifier Failure Rate:</span>
              <span className="font-mono font-bold text-red-600">
                {verifierTotalCount > 0 ? `${verifierFailRate.toFixed(1)}%` : "0.0%"}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-600">Failed Attestations:</span>
              <span className="font-mono font-bold text-gray-900">{verifierFailCount}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-600">Passed Attestations:</span>
              <span className="font-mono font-bold text-emerald-600">{verifierTotalCount - verifierFailCount}</span>
            </div>
            <p className="text-[11px] text-gray-500 pt-1 border-t border-gray-200">
              Protocol verification enforces strict cryptographic proof validation from the trusted verifier.
            </p>
          </div>
        </div>
      </div>

      {/* 4. Chart: Settlement outcomes, last 30 days */}
      <div className="p-5 rounded-xl border border-gray-200 bg-white shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-gray-900">
              Settlement Outcomes (Last 30 Days)
            </h2>
            <p className="text-xs text-gray-500">
              Daily settlement success rate. Days with no settlements are represented as gaps.
            </p>
          </div>
          {hoveredDay && (
            <div className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs flex items-center gap-3 shadow-sm font-mono">
              <span className="text-gray-300">{hoveredDay.dateStr}</span>
              <span className="text-emerald-400">Paid: {hoveredDay.paid}</span>
              <span className="text-red-400">Refunded: {hoveredDay.refunded}</span>
              <span className="text-blue-300 font-bold">
                {hoveredDay.successRate !== null ? `${hoveredDay.successRate.toFixed(1)}%` : "No Activity"}
              </span>
            </div>
          )}
        </div>

        {/* 30-day Bar / Dot Visualization */}
        <div className="h-44 flex items-end gap-1.5 pt-6 pb-2 px-2 bg-[#f6f7f9] rounded-lg border border-gray-200 overflow-x-auto">
          {dailyOutcomes.map((day, idx) => {
            const hasData = day.successRate !== null;
            const heightPercent = hasData ? Math.max(10, day.successRate!) : 0;

            return (
              <div
                key={day.dateStr}
                onMouseEnter={() => setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
                className="flex-1 min-w-[20px] h-full flex flex-col justify-end items-center group cursor-pointer relative"
              >
                {/* Bar */}
                {hasData ? (
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full rounded-t transition-all ${
                      day.successRate! >= 90
                        ? "bg-emerald-500 group-hover:bg-emerald-600"
                        : day.successRate! >= 70
                        ? "bg-amber-500 group-hover:bg-amber-600"
                        : "bg-red-500 group-hover:bg-red-600"
                    }`}
                  />
                ) : (
                  // Gap indicator
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mb-1" />
                )}

                {/* Day label on bottom (show every 5th or hovered) */}
                <div className="text-[9px] text-gray-500 mt-2 font-mono truncate w-full text-center">
                  {idx % 5 === 0 ? day.dayLabel : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Per-Machine Sortable Table */}
      <div className="p-5 rounded-xl border border-gray-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Per-Machine Performance</h2>
            <p className="text-xs text-gray-500">Live statistics computed from contract events and MachineRegistry.</p>
          </div>
        </div>

        {sortedMachineStats.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500 border border-dashed border-gray-200 rounded-lg">
            No settled jobs yet. Create a job from the Wallet Map to see metrics.
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#f6f7f9] border-b border-gray-200 text-gray-600 font-semibold">
                <tr>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => handleSort("machineId")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Machine ID</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => handleSort("paidCount")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Paid</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => handleSort("refundedCount")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Failed / Refunded</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => handleSort("successRate")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Success Rate</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => handleSort("avgDurationSec")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Avg Settlement Time</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => handleSort("reputation")}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Reputation</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-800">
                {sortedMachineStats.map((m) => (
                  <tr key={m.machineId} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-gray-900">
                      {m.machineId}
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-600 font-medium">
                      {m.paidCount}
                    </td>
                    <td className="py-3 px-4 font-mono text-red-500 font-medium">
                      {m.refundedCount}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-semibold text-xs ${
                          m.totalSettled === 0
                            ? "text-gray-400 bg-gray-100"
                            : m.successRate >= 90
                            ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                            : "text-amber-700 bg-amber-50 border border-amber-200"
                        }`}
                      >
                        {m.totalSettled > 0 ? `${m.successRate.toFixed(1)}%` : "—"}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-700">
                      {m.avgDurationSec > 0 ? `${m.avgDurationSec}s` : "—"}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-gray-900">
                      {m.reputation} / 100
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
