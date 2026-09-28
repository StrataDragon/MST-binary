import React from "react";
import { AlertTriangle, Flame, ShieldAlert, WifiOff, CheckCircle2, Clock } from "lucide-react";

export function AlertsView() {
  const alerts = [
    {
      id: "alt-1",
      severity: "high",
      title: "Unusual Gas Spike Detected",
      detail: "Average base fee reached 48 Gwei on block #1402. Consider deferring batch settlement jobs.",
      time: "14m ago",
      icon: Flame,
      status: "ACTIVE",
    },
    {
      id: "alt-2",
      severity: "low",
      title: "Machine M-089 Collateral Near Minimum",
      detail: "Collateral stake is at 0.01 MST. Any additional slashing will drop machine into suspended state.",
      time: "1h ago",
      icon: ShieldAlert,
      status: "MONITORING",
    },
    {
      id: "alt-3",
      severity: "resolved",
      title: "Revert Recovered: Job 0x927d...",
      detail: "Job execution re-verified after initial coordinate drift timeout. Funds released successfully.",
      time: "3h ago",
      icon: CheckCircle2,
      status: "RESOLVED",
    },
    {
      id: "alt-4",
      severity: "resolved",
      title: "Verifier Service Heartbeat Restored",
      detail: "Node/Express verifier service at port 4000 resumed normal latency (38ms avg).",
      time: "5h ago",
      icon: Clock,
      status: "RESOLVED",
    },
  ];

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h2 className="text-base font-bold text-primary tracking-tight">Active System Alerts & Health</h2>
          <p className="text-xs text-secondary">
            Continuous anomaly detection across gas markets, hardware machines, and escrow balances.
          </p>
        </div>
        <span className="pill-pending text-[10px] font-mono font-bold px-2.5 py-1 rounded-full">
          1 High · 1 Low · 2 Resolved
        </span>
      </div>

      <div className="divide-y divide-border">
        {alerts.map((alt) => {
          const Icon = alt.icon;
          return (
            <div key={alt.id} className="py-3.5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    alt.severity === "high"
                      ? "bg-red-50 text-accent-red"
                      : alt.severity === "low"
                      ? "bg-amber-50 text-accent-amber"
                      : "bg-green-50 text-accent-green"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-primary">{alt.title}</h4>
                  <p className="text-xs text-secondary mt-0.5 leading-relaxed">{alt.detail}</p>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <span
                  className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    alt.status === "ACTIVE"
                      ? "pill-failed"
                      : alt.status === "MONITORING"
                      ? "pill-pending"
                      : "pill-confirmed"
                  }`}
                >
                  {alt.status}
                </span>
                <span className="text-[10px] text-muted block mt-1 font-mono">{alt.time}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
