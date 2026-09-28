import React, { useState, useEffect } from "react";
import { Search, ChevronRight, Bell, LogOut, CheckCircle2, Wallet, X, ArrowRight } from "lucide-react";
import { ConnectWallet } from "./ConnectWallet";
import { NetworkBadge } from "./NetworkBadge";
import { cfg } from "../lib/config";
import { SentinelTab } from "./Sidebar";
import { alertManager, SystemAlert } from "../lib/alertRules";

interface TopNavProps {
  currentTab: SentinelTab;
  onSelectTab: (tab: SentinelTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onConnected: (addr: string, signer: any) => void;
  clientAddress: string | null;
  onDisconnect?: () => void;
}

export function TopNav({
  currentTab,
  onSelectTab,
  searchQuery,
  onSearchChange,
  onConnected,
  clientAddress,
  onDisconnect,
}: TopNavProps) {
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(alertManager.getUnreadCount());
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [recentAlerts, setRecentAlerts] = useState<SystemAlert[]>(alertManager.getAll().slice(0, 4));

  useEffect(() => {
    return alertManager.subscribe((alerts) => {
      setUnreadAlertsCount(alerts.filter((a) => !a.read).length);
      setRecentAlerts(alerts.slice(0, 4));
    });
  }, []);

  const tabTitles: Record<SentinelTab, string> = {
    overview: "Overview",
    marketplace: "Autonomous Marketplace",
    pricing: "Dynamic Pricing Engine",
    "wallet-map": "Wallet Map",
    "tx-history": "Transaction History",
    "transaction-lab": "Transaction Lab",
    "settlement-testing": "Settlement Analytics",
    "settlement-analytics": "Settlement Analytics",
    alerts: "Alerts",
    reports: "Reports",
    contracts: "Escrow Contracts",
    settings: "Settings",
    "address-book": "Address Book",
  };

  return (
    <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between gap-4 sticky top-0 z-20 shadow-xs">
      {/* Breadcrumb Title */}
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono text-secondary tracking-wider font-semibold">MACHINAPAY</span>
        <ChevronRight className="w-3.5 h-3.5 text-muted" />
        <span className="font-semibold text-primary tracking-wide font-mono">
          {tabTitles[currentTab] || "Overview"}
        </span>
      </div>

      {/* Center Search Input */}
      <div className="flex-1 max-w-md mx-4">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search wallets, jobs, alerts, entities..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-page border border-border rounded-full pl-9 pr-4 py-1.5 text-xs text-primary placeholder-muted focus:outline-none focus:border-accent-blue transition-all font-mono"
          />
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Network Switcher Badge (Feature 7) */}
        <NetworkBadge />

        {/* Notification Bell with Dropdown (Feature 5) */}
        <div className="relative">
          <button
            onClick={() => setIsAlertOpen(!isAlertOpen)}
            className="p-1.5 rounded-full text-secondary hover:text-primary hover:bg-page transition-colors relative"
            title="System Alerts"
          >
            <Bell className="w-4 h-4" />
            {unreadAlertsCount > 0 && (
              <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-accent-red text-[9px] font-bold text-white flex items-center justify-center">
                {unreadAlertsCount}
              </span>
            )}
          </button>

          {/* Alert Quick Preview Dropdown */}
          {isAlertOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-xl z-50 p-3 space-y-2 animate-fade-in font-mono text-xs">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="font-bold text-primary uppercase text-[10px] tracking-wider">
                  Unread Notifications ({unreadAlertsCount})
                </span>
                <button
                  onClick={() => setIsAlertOpen(false)}
                  className="text-secondary hover:text-primary"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="divide-y divide-border max-h-60 overflow-y-auto pr-1">
                {recentAlerts.map((a) => (
                  <div key={a.id} className="py-2 space-y-0.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-primary truncate max-w-[170px]">{a.title}</span>
                      <span className="text-muted">{a.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-secondary font-sans leading-tight truncate">{a.message}</p>
                  </div>
                ))}

                {recentAlerts.length === 0 && (
                  <div className="py-4 text-center text-muted text-[11px]">No alerts recorded</div>
                )}
              </div>

              <div className="pt-2 border-t border-border flex justify-between items-center text-[11px]">
                <button
                  onClick={() => {
                    alertManager.markAllAsRead();
                    setIsAlertOpen(false);
                  }}
                  className="text-secondary hover:text-primary"
                >
                  Mark all read
                </button>
                <button
                  onClick={() => {
                    setIsAlertOpen(false);
                    onSelectTab("alerts");
                  }}
                  className="text-accent-blue font-bold hover:underline flex items-center gap-1"
                >
                  <span>Open Feed</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Connect Wallet Button / Address Pill */}
        <ConnectWallet
          onConnected={onConnected}
          clientAddress={clientAddress}
          onDisconnect={onDisconnect}
        />

        {/* Logout / Disconnect Icon */}
        {clientAddress && (
          <button
            onClick={onDisconnect}
            title="Disconnect Wallet"
            className="p-1.5 rounded-full text-secondary hover:text-accent-red hover:bg-page transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}
