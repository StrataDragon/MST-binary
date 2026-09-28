import React, { useState } from "react";
import { formatEther } from "ethers";
import { GitFork, ShieldCheck, CheckCircle2, XCircle, ArrowUpRight, Search, Filter, ShieldAlert } from "lucide-react";
import { JobSummary, statusLabel } from "./JobList";
import { cfg } from "../lib/config";

interface AuditComparisonTableProps {
  jobs: JobSummary[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
  searchFilter: string;
}

export function AuditComparisonTable({
  jobs,
  selectedJobId,
  onSelectJob,
  searchFilter,
}: AuditComparisonTableProps) {
  const [filterMode, setFilterMode] = useState<"all" | "active" | "paid" | "refunded">("all");

  const filteredJobs = jobs.filter((j) => {
    // Status filter
    if (filterMode === "active" && (j.state === 6 || j.state === 7)) return false;
    if (filterMode === "paid" && j.state !== 6) return false;
    if (filterMode === "refunded" && j.state !== 7) return false;

    // Search query
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      return (
        j.jobId.toLowerCase().includes(q) ||
        j.customer.toLowerCase().includes(q) ||
        j.reward.includes(q)
      );
    }
    return true;
  });

  return (
    <div className="rounded-2xl border border-line/70 bg-[#0c1411] p-5 shadow-xl space-y-4">
      {/* Table Header and Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-line/60">
        <div>
          <h3 className="text-sm font-bold text-white tracking-wide uppercase">
            Full Transaction & Verification Audit Matrix
          </h3>
          <p className="text-xs text-dim">
            Real-time cryptographic audit of autonomous machine escrow executions on MST ledger.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#090f0c] border border-line">
          {(["all", "active", "paid", "refunded"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1 rounded-md text-xs font-mono font-medium capitalize transition-all ${
                filterMode === mode
                  ? "bg-panel text-signal font-semibold border border-signal/40 shadow-sm"
                  : "text-dim hover:text-white"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-line/60 text-[11px] text-dim/80 uppercase tracking-wider">
              <th className="py-2.5 px-3">Transaction / Job ID</th>
              <th className="py-2.5 px-3">Escrow Value</th>
              <th className="py-2.5 px-3">Machine Identity</th>
              <th className="py-2.5 px-3">Target Zone</th>
              <th className="py-2.5 px-3">EIP-712 Proof</th>
              <th className="py-2.5 px-3">Attestation</th>
              <th className="py-2.5 px-3">Settlement</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/40">
            {filteredJobs.map((j) => {
              const status = statusLabel(j.state, j.verdict);
              const isSelected = selectedJobId === j.jobId;

              return (
                <tr
                  key={j.jobId}
                  className={`hover:bg-[#121c17] transition-colors ${
                    isSelected ? "bg-panel/70 border-l-2 border-signal" : ""
                  }`}
                >
                  {/* Job ID */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{j.jobId.slice(0, 10)}…</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded-full border uppercase ${
                          j.state === 6
                            ? "bg-ok/10 text-ok border-ok/30"
                            : j.state === 7
                            ? "bg-bad/10 text-bad border-bad/30"
                            : "bg-signal/10 text-signal border-signal/30"
                        }`}
                      >
                        {status.text}
                      </span>
                    </div>
                  </td>

                  {/* Escrow Value */}
                  <td className="py-3 px-3">
                    <span className="font-bold text-signal">{j.reward}</span>{" "}
                    <span className="text-dim text-[10px]">{cfg.nativeToken}</span>
                  </td>

                  {/* Machine Agent */}
                  <td className="py-3 px-3">
                    <span className="text-white/90">M-042</span>
                    <span className="text-[10px] text-dim block">Staked 0.01 MST</span>
                  </td>

                  {/* Target Zone */}
                  <td className="py-3 px-3">
                    <span className="text-emerald-400 font-semibold">Green (9, 4)</span>
                  </td>

                  {/* Proof */}
                  <td className="py-3 px-3">
                    {j.state >= 4 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-ok/10 text-ok border border-ok/30 text-[10px]">
                        <CheckCircle2 className="w-3 h-3" /> Signed ECDSA
                      </span>
                    ) : (
                      <span className="text-dim text-[10px]">Pending</span>
                    )}
                  </td>

                  {/* Attestation */}
                  <td className="py-3 px-3">
                    {j.state >= 6 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-ok/10 text-ok border border-ok/30 text-[10px]">
                        <ShieldCheck className="w-3 h-3" /> PASS
                      </span>
                    ) : j.state === 4 && j.verdict === 2 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-bad/10 text-bad border border-bad/30 text-[10px]">
                        <XCircle className="w-3 h-3" /> REJECT
                      </span>
                    ) : (
                      <span className="text-dim text-[10px]">Awaiting Verify</span>
                    )}
                  </td>

                  {/* Settlement */}
                  <td className="py-3 px-3">
                    <span
                      className={`font-semibold ${
                        j.state === 6
                          ? "text-ok"
                          : j.state === 7
                          ? "text-bad"
                          : "text-signal"
                      }`}
                    >
                      {j.state === 6 ? "PAID" : j.state === 7 ? "REFUNDED" : "LOCKED"}
                    </span>
                  </td>

                  {/* Action */}
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => onSelectJob(j.jobId)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-panel hover:bg-line text-white border border-line text-[11px] font-sans font-semibold transition-all hover:border-signal"
                    >
                      <GitFork className="w-3 h-3 text-signal" />
                      <span>Inspect DAG</span>
                    </button>
                  </td>
                </tr>
              );
            })}

            {filteredJobs.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-dim text-xs">
                  No matching jobs found in escrow registry.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sentinel-style Green Best Strategy Banner at the bottom */}
      <div className="p-3.5 rounded-xl border border-ok/30 bg-ok/5 flex items-start gap-3 text-xs text-ok/90 font-sans leading-relaxed">
        <ShieldCheck className="w-4 h-4 text-ok flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-ok">Optimal Security Protocol: DUAL EIP-712 ATTESTATION</span> — Off-chain machine evidence signed by hardware identity <code className="font-mono text-white/90 bg-ink px-1 rounded">M-042</code> is cryptographically verified and countersigned by the Member 3 verifier engine. Settlement executes trustlessly via <code className="font-mono text-white/90 bg-ink px-1 rounded">JobEscrow.sol</code> on MST ledger.
        </div>
      </div>
    </div>
  );
}
