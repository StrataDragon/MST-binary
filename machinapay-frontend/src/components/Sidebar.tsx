import React from "react";
import {
  Activity,
  Network,
  History,
  FlaskConical,
  FileCheck2,
  Bell,
  FileText,
  BookOpen,
  Layers,
  Settings,
} from "lucide-react";
import { cfg } from "../lib/config";

export type SentinelTab =
  | "overview"
  | "wallet-map"
  | "tx-history"
  | "transaction-lab"
  | "settlement-testing"
  | "alerts"
  | "reports"
  | "address-book"
  | "contracts"
  | "settings";

interface SidebarProps {
  currentTab: SentinelTab;
  onSelectTab: (tab: SentinelTab) => void;
  jobCount: number;
}

export function Sidebar({ currentTab, onSelectTab, jobCount }: SidebarProps) {
  return (
    <aside className="w-14 sm:w-16 md:w-64 flex-shrink-0 bg-[#0B0B0E] border-r border-[#1E1E24] text-[#E5E7EB] flex flex-col justify-between select-none font-mono transition-all">
      <div>
        {/* Brand / Logo */}
        <div className="h-16 px-3 md:px-5 border-b border-[#1E1E24] flex items-center gap-3 justify-center md:justify-start">
          <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-white font-mono font-bold text-sm flex-shrink-0">
            SN
          </div>
          <div className="hidden md:block">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-white">SENTINEL</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-accent-blue/20 text-accent-blue font-semibold border border-accent-blue/30">
                ESCROW
              </span>
            </div>
            <p className="text-[10px] text-[#9CA3AF] font-mono tracking-tight">MachinaPay AMR Intelligence</p>
          </div>
        </div>

        {/* Navigation Groups */}
        <div className="p-2 md:p-3 space-y-6 overflow-y-auto max-h-[calc(100vh-140px)]">
          {/* MONITORING */}
          <div>
            <p className="hidden md:block px-3 text-[11px] font-bold uppercase tracking-wide text-[#6B7280] mb-2">
              Monitoring
            </p>
            <nav className="space-y-0.5">
              <button
                onClick={() => onSelectTab("overview")}
                title="Overview"
                className={`w-full flex items-center justify-center md:justify-between px-2 md:px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  currentTab === "overview"
                    ? "bg-white/10 text-white border-l-2 border-accent-blue font-semibold"
                    : "text-[#9CA3AF] hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Activity className={`w-4 h-4 flex-shrink-0 ${currentTab === "overview" ? "text-accent-blue" : "text-[#9CA3AF]"}`} />
                  <span className="hidden md:inline">Overview</span>
                </div>
              </button>

              <button
                onClick={() => onSelectTab("wallet-map")}
                title="Wallet Map"
                className={`w-full flex items-center justify-center md:justify-between px-2 md:px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  currentTab === "wallet-map"
                    ? "bg-white/10 text-white border-l-2 border-accent-blue font-semibold"
                    : "text-[#9CA3AF] hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Network className={`w-4 h-4 flex-shrink-0 ${currentTab === "wallet-map" ? "text-accent-blue" : "text-[#9CA3AF]"}`} />
                  <span className="hidden md:inline">Wallet Map</span>
                </div>
                <span className="hidden md:inline text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-accent-green">
                  Live
                </span>
              </button>

              <button
                onClick={() => onSelectTab("tx-history")}
                title="Transaction History"
                className={`w-full flex items-center justify-center md:justify-between px-2 md:px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  currentTab === "tx-history"
                    ? "bg-white/10 text-white border-l-2 border-accent-blue font-semibold"
                    : "text-[#9CA3AF] hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <History className={`w-4 h-4 flex-shrink-0 ${currentTab === "tx-history" ? "text-accent-blue" : "text-[#9CA3AF]"}`} />
                  <span className="hidden md:inline">Transaction History</span>
                </div>
              </button>
            </nav>
          </div>

          {/* ANALYSIS */}
          <div>
            <p className="hidden md:block px-3 text-[11px] font-bold uppercase tracking-wide text-[#6B7280] mb-2">
              Analysis
            </p>
            <nav className="space-y-0.5">
              <button
                onClick={() => onSelectTab("transaction-lab")}
                title="Transaction Lab"
                className={`w-full flex items-center justify-center md:justify-between px-2 md:px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  currentTab === "transaction-lab"
                    ? "bg-white/10 text-white border-l-2 border-accent-blue font-semibold"
                    : "text-[#9CA3AF] hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FlaskConical className={`w-4 h-4 flex-shrink-0 ${currentTab === "transaction-lab" ? "text-accent-blue" : "text-[#9CA3AF]"}`} />
                  <span className="hidden md:inline">Transaction Lab</span>
                </div>
                <span className="hidden md:inline text-[10px] font-mono px-1.5 py-0.2 rounded bg-accent-blue/10 text-accent-blue">
                  Batch
                </span>
              </button>

              <button
                onClick={() => onSelectTab("settlement-testing")}
                title="Settlement Testing"
                className={`w-full flex items-center justify-center md:justify-between px-2 md:px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  currentTab === "settlement-testing"
                    ? "bg-white/10 text-white border-l-2 border-accent-blue font-semibold"
                    : "text-[#9CA3AF] hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileCheck2 className={`w-4 h-4 flex-shrink-0 ${currentTab === "settlement-testing" ? "text-accent-blue" : "text-[#9CA3AF]"}`} />
                  <span className="hidden md:inline">Settlement Testing</span>
                </div>
                <span className="hidden md:inline text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-[#9CA3AF]">
                  Radar
                </span>
              </button>
            </nav>
          </div>

          {/* OPERATIONS */}
          <div>
            <p className="hidden md:block px-3 text-[11px] font-bold uppercase tracking-wide text-[#6B7280] mb-2">
              Operations
            </p>
            <nav className="space-y-0.5">
              <button
                onClick={() => onSelectTab("alerts")}
                title="Alerts"
                className={`w-full flex items-center justify-center md:justify-between px-2 md:px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  currentTab === "alerts"
                    ? "bg-white/10 text-white border-l-2 border-accent-blue font-semibold"
                    : "text-[#9CA3AF] hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Bell className={`w-4 h-4 flex-shrink-0 ${currentTab === "alerts" ? "text-accent-blue" : "text-[#9CA3AF]"}`} />
                  <span className="hidden md:inline">Alerts</span>
                </div>
              </button>

              <button
                onClick={() => onSelectTab("address-book")}
                title="Address Book"
                className={`w-full flex items-center justify-center md:justify-between px-2 md:px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  currentTab === "address-book"
                    ? "bg-white/10 text-white border-l-2 border-accent-blue font-semibold"
                    : "text-[#9CA3AF] hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <BookOpen className={`w-4 h-4 flex-shrink-0 ${currentTab === "address-book" ? "text-accent-blue" : "text-[#9CA3AF]"}`} />
                  <span className="hidden md:inline">Address Book</span>
                </div>
              </button>

              <button
                onClick={() => onSelectTab("reports")}
                title="Reports"
                className={`w-full flex items-center justify-center md:justify-between px-2 md:px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  currentTab === "reports"
                    ? "bg-white/10 text-white border-l-2 border-accent-blue font-semibold"
                    : "text-[#9CA3AF] hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileText className={`w-4 h-4 flex-shrink-0 ${currentTab === "reports" ? "text-accent-blue" : "text-[#9CA3AF]"}`} />
                  <span className="hidden md:inline">Reports</span>
                </div>
              </button>
            </nav>
          </div>

          {/* SYSTEM */}
          <div>
            <p className="hidden md:block px-3 text-[11px] font-bold uppercase tracking-wide text-[#6B7280] mb-2">
              System
            </p>
            <nav className="space-y-0.5">
              <button
                onClick={() => onSelectTab("contracts")}
                title="Escrow Contracts"
                className={`w-full flex items-center justify-center md:justify-start gap-2.5 px-2 md:px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  currentTab === "contracts"
                    ? "bg-white/10 text-white border-l-2 border-accent-blue font-semibold"
                    : "text-[#9CA3AF] hover:text-white hover:bg-white/5"
                }`}
              >
                <Layers className={`w-4 h-4 flex-shrink-0 ${currentTab === "contracts" ? "text-accent-blue" : "text-[#9CA3AF]"}`} />
                <span className="hidden md:inline">Escrow Contracts</span>
              </button>
              <button
                onClick={() => onSelectTab("settings")}
                title="Settings"
                className={`w-full flex items-center justify-center md:justify-start gap-2.5 px-2 md:px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  currentTab === "settings"
                    ? "bg-white/10 text-white border-l-2 border-accent-blue font-semibold"
                    : "text-[#9CA3AF] hover:text-white hover:bg-white/5"
                }`}
              >
                <Settings className={`w-4 h-4 flex-shrink-0 ${currentTab === "settings" ? "text-accent-blue" : "text-[#9CA3AF]"}`} />
                <span className="hidden md:inline">Settings</span>
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-2 md:p-3 border-t border-[#1E1E24] bg-[#070709] space-y-1.5 text-center md:text-left">
        <div className="flex items-center justify-center md:justify-between text-[11px] font-mono text-[#9CA3AF]">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
            <span className="hidden md:inline">{cfg.network}</span>
          </span>
          <span className="hidden md:inline text-[10px] px-1 rounded bg-white/10 text-[#9CA3AF]">ID {cfg.chainId}</span>
        </div>
        <div className="hidden md:block text-[10px] font-mono text-[#6B7280] truncate">
          Escrow: <span className="text-[#E5E7EB]">{cfg.addresses.JobEscrow.slice(0, 10)}…</span>
        </div>
      </div>
    </aside>
  );
}
