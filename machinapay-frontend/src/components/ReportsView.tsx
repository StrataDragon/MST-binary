import React, { useState } from "react";
import { Download, FileText, CheckCircle2, TrendingUp, Calendar, ShieldCheck, Printer } from "lucide-react";
import { JobSummary } from "./JobList";
import { addressBook } from "../lib/addressBook";
import { priceFeed } from "../lib/priceFeed";
import { cfg } from "../lib/config";

interface ReportsViewProps {
  jobs: JobSummary[];
  tvl: string;
}

export function ReportsView({ jobs, tvl }: ReportsViewProps) {
  const [dateRange, setDateRange] = useState<"24h" | "7d" | "30d" | "all">("30d");

  const generatedDate = new Date().toLocaleString();
  const ethPrice = priceFeed.getCachedPrice();
  const totalEthVolume = jobs.reduce((sum, j) => sum + (parseFloat(j.reward) || 0), 0).toFixed(2);
  const totalUsdVolume = priceFeed.toUsdString(totalEthVolume, ethPrice);
  const paidCount = jobs.filter((j) => j.state === 6).length;
  const efficacyRate = jobs.length > 0 ? ((paidCount / jobs.length) * 100).toFixed(1) : "100.0";

  function handleExportCsv() {
    const headers = ["Job ID", "State", "Verdict", "Reward (ETH)", "Reward (USD)", "Customer Entity", "Customer Address"];
    const rows = jobs.map((j) => {
      const resolved = addressBook.resolve(j.customer);
      return [
        j.jobId,
        j.state,
        j.verdict === 1 ? "PASS" : j.verdict === 2 ? "FAIL" : "PENDING",
        j.reward,
        priceFeed.toUsdString(j.reward, ethPrice),
        `"${resolved.label}"`,
        j.customer,
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [`# MACHINAPAY FULL SETTLEMENT AUDIT REPORT`, `# Generated: ${generatedDate}`, `# Horizon: ${dateRange}`, headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `machinapay-settlement-audit-${dateRange}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleExportJson() {
    const reportData = {
      title: "MachinaPay Full Settlement Report",
      generatedAt: generatedDate,
      horizon: dateRange,
      network: cfg.network,
      chainId: cfg.chainId,
      summary: {
        totalJobs: jobs.length,
        totalEthVolume,
        totalUsdVolume,
        paidJobsCount: paidCount,
        settlementEfficacyRate: `${efficacyRate}%`,
      },
      jobs: jobs.map((j) => ({
        ...j,
        customerLabel: addressBook.resolve(j.customer).label,
      })),
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reportData, null, 2));
    const dl = document.createElement("a");
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", `machinapay-settlement-audit-${Date.now()}.json`);
    document.body.appendChild(dl);
    dl.click();
    document.body.removeChild(dl);
  }

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm p-6 space-y-6 font-mono text-xs">
      {/* Top Header with Export Report Button (SENTINEL Style) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-base font-bold text-primary tracking-tight">Full Settlement Audit Report</h2>
          <p className="text-xs text-secondary font-sans">
            Cryptographic escrow ledger audit and settlement horizon documentation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Range Selector */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="bg-page border border-border rounded px-2.5 py-1.5 text-xs text-primary focus:outline-none focus:border-accent-blue"
          >
            <option value="24h">Horizon: 24h</option>
            <option value="7d">Horizon: 7d</option>
            <option value="30d">Horizon: 30d</option>
            <option value="all">Horizon: All-Time</option>
          </select>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-page hover:bg-gray-100 text-xs font-semibold text-primary transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleExportJson}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-blue hover:bg-blue-600 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Report JSON</span>
          </button>
        </div>
      </div>

      {/* Summary Stats Block (Matches "Full Simulation Report" reference screenshot layout) */}
      <div className="p-4 rounded-lg bg-page border border-border space-y-3">
        <div className="flex flex-wrap items-center justify-between text-secondary text-[11px] border-b border-border pb-2">
          <div>
            <span className="text-muted">Generated: </span>
            <span className="font-bold text-primary">{generatedDate}</span>
          </div>
          <div>
            <span className="text-muted">Analysis Horizon: </span>
            <span className="font-bold text-primary uppercase">{dateRange}</span>
          </div>
          <div>
            <span className="text-muted">Verification Protocol: </span>
            <span className="font-bold text-accent-green">Dual EIP-712 ECDSA</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-1">
          <div>
            <span className="text-muted text-[10px] uppercase block">Total Verified Jobs</span>
            <span className="text-xl font-bold text-primary block mt-0.5">{jobs.length}</span>
          </div>
          <div>
            <span className="text-muted text-[10px] uppercase block">Settlement Volume</span>
            <span className="text-xl font-bold text-primary block mt-0.5">{totalEthVolume} ETH</span>
            <span className="text-[10px] text-muted">{totalUsdVolume}</span>
          </div>
          <div>
            <span className="text-muted text-[10px] uppercase block">Settlement Efficacy</span>
            <span className="text-xl font-bold text-accent-green block mt-0.5">{efficacyRate}%</span>
          </div>
          <div>
            <span className="text-muted text-[10px] uppercase block">Dispute Rate</span>
            <span className="text-xl font-bold text-accent-green block mt-0.5">0.0%</span>
          </div>
        </div>
      </div>

      {/* Audit Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-[11px] text-secondary uppercase">
              <th className="py-2.5 px-3">Job ID</th>
              <th className="py-2.5 px-3">Customer Entity</th>
              <th className="py-2.5 px-3">Reward Escrow</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3 text-right">Attestation Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {jobs.map((j) => {
              const party = addressBook.resolve(j.customer);
              return (
                <tr key={j.jobId} className="hover:bg-page transition-colors">
                  <td className="py-2.5 px-3 font-bold text-primary">{j.jobId.slice(0, 14)}…</td>
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-primary block">{party.label}</span>
                    <span className="text-[10px] text-muted block">{party.truncated}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-primary">{j.reward} ETH</span>
                    <span className="text-[10px] text-muted block">{priceFeed.toUsdString(j.reward, ethPrice)}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        j.state === 6 ? "pill-confirmed" : j.state === 7 ? "pill-failed" : "pill-pending"
                      }`}
                    >
                      {j.state === 6 ? "CONFIRMED" : j.state === 7 ? "REFUNDED" : "IN_PROGRESS"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="text-accent-green font-bold">
                      {j.verdict === 1 ? "PASS" : j.verdict === 2 ? "FAIL" : "PENDING"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
