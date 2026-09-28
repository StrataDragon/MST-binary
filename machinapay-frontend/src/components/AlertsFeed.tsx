import React, { useState, useEffect } from "react";
import {
  Bell,
  AlertTriangle,
  Flame,
  CheckCircle2,
  ShieldAlert,
  Clock,
  ArrowRight,
  Trash2,
  CheckCheck,
} from "lucide-react";
import { alertManager, SystemAlert, AlertType } from "../lib/alertRules";
import { addressBook } from "../lib/addressBook";

interface AlertsFeedProps {
  onNavigateToTx?: (txHash: string) => void;
  onNavigateToWallet?: (address: string) => void;
}

export function AlertsFeed({ onNavigateToTx, onNavigateToWallet }: AlertsFeedProps) {
  const [alerts, setAlerts] = useState<SystemAlert[]>(alertManager.getAll());
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    return alertManager.subscribe(setAlerts);
  }, []);

  const filteredAlerts = alerts.filter((a) => {
    if (typeFilter !== "all" && a.type !== typeFilter) return false;
    return true;
  });

  const iconMap: Record<AlertType, any> = {
    LOW_BALANCE: AlertTriangle,
    TX_FAILED: AlertTriangle,
    LARGE_TRANSFER: ShieldAlert,
    UNKNOWN_ADDRESS_INTERACTION: ShieldAlert,
    GAS_SPIKE: Flame,
  };

  const severityPill = {
    high: "pill-failed",
    medium: "pill-pending",
    low: "pill-disputed",
  };

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm p-5 space-y-4 font-mono text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="text-base font-bold text-primary tracking-tight flex items-center gap-2">
            <Bell className="w-4 h-4 text-accent-blue" />
            <span>Alerts & Protocol Notification Center</span>
          </h2>
          <p className="text-xs text-secondary font-sans">
            Client-side anomaly rules evaluated against live block receipts, gas spikes, and counterparty entities.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => alertManager.markAllAsRead()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-page hover:bg-gray-100 text-xs text-secondary hover:text-primary transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark All Read</span>
          </button>
          <button
            onClick={() => alertManager.clearAll()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-page hover:bg-gray-100 text-xs text-secondary hover:text-accent-red transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-page border border-border text-[11px]">
        {(
          [
            { id: "all", label: "All Alerts" },
            { id: "TX_FAILED", label: "Reverts / Fails" },
            { id: "LARGE_TRANSFER", label: "Large Transfers" },
            { id: "GAS_SPIKE", label: "Gas Spikes" },
            { id: "LOW_BALANCE", label: "Low Balance" },
            { id: "UNKNOWN_ADDRESS_INTERACTION", label: "Unlabeled Addrs" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTypeFilter(t.id)}
            className={`px-2.5 py-1 rounded uppercase font-bold transition-all ${
              typeFilter === t.id
                ? "bg-card text-accent-blue shadow-xs border border-border"
                : "text-secondary hover:text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Alert Card List */}
      <div className="divide-y divide-border">
        {filteredAlerts.map((alt) => {
          const Icon = iconMap[alt.type] || Bell;

          return (
            <div
              key={alt.id}
              onClick={() => alertManager.markAsRead(alt.id)}
              className={`py-3.5 px-2 rounded-lg flex items-start justify-between gap-4 transition-colors ${
                !alt.read ? "bg-blue-50/30" : "hover:bg-page"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    alt.severity === "high"
                      ? "bg-red-50 text-accent-red"
                      : alt.severity === "medium"
                      ? "bg-amber-50 text-accent-amber"
                      : "bg-blue-50 text-accent-blue"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-primary">{alt.title}</h4>
                    {!alt.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-blue" />
                    )}
                  </div>
                  <p className="text-xs text-secondary font-sans leading-relaxed">{alt.message}</p>

                  {/* Actions / Click-through */}
                  <div className="flex items-center gap-3 pt-1 text-[11px]">
                    {alt.txHash && onNavigateToTx && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToTx(alt.txHash!);
                        }}
                        className="text-accent-blue hover:underline flex items-center gap-1"
                      >
                        <span>View Tx Details</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                    {alt.targetAddress && onNavigateToWallet && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToWallet(alt.targetAddress!);
                        }}
                        className="text-secondary hover:text-primary hover:underline flex items-center gap-1"
                      >
                        <span>Inspect Wallet</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    severityPill[alt.severity]
                  }`}
                >
                  {alt.severity}
                </span>
                <span className="text-[10px] text-muted block mt-1">{alt.timestamp}</span>
              </div>
            </div>
          );
        })}

        {filteredAlerts.length === 0 && (
          <div className="py-8 text-center text-muted">
            No active alerts matching the selected filter.
          </div>
        )}
      </div>
    </div>
  );
}
