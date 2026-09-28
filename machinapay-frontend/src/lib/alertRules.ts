import { addressBook } from "./addressBook";
import { settingsStore } from "./settings";
import { TxEvent } from "./events";

export type AlertType =
  | "LOW_BALANCE"
  | "TX_FAILED"
  | "LARGE_TRANSFER"
  | "UNKNOWN_ADDRESS_INTERACTION"
  | "GAS_SPIKE";

export interface SystemAlert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  severity: "high" | "medium" | "low";
  timestamp: string;
  timeMillis: number;
  read: boolean;
  txHash?: string;
  targetAddress?: string;
  jobId?: string;
}

const ALERTS_STORAGE_KEY = "machinapay_system_alerts_v1";

const INITIAL_ALERTS: SystemAlert[] = [
  {
    id: "alt-init-1",
    type: "GAS_SPIKE",
    title: "Gas Surge Detected on Block #1402",
    message: "Base fee briefly spiked to 48 Gwei. Batch transfer queued at standard fee priority.",
    severity: "medium",
    timestamp: "15m ago",
    timeMillis: Date.now() - 900000,
    read: false,
  },
  {
    id: "alt-init-2",
    type: "LARGE_TRANSFER",
    title: "Escrow Deposit Confirmed: 100 ETH",
    message: "Large escrow lock of 100 ETH created by client wallet for Job 0x795e…",
    severity: "low",
    timestamp: "1h ago",
    timeMillis: Date.now() - 3600000,
    read: false,
    txHash: "0x17946b086b55376bf4acc37009bcbdbb3ace2382d51bec88b3f5454c3c8d57f1",
  },
];

type AlertListener = (alerts: SystemAlert[]) => void;
const listeners: AlertListener[] = [];

export const alertManager = {
  getAll(): SystemAlert[] {
    try {
      const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
      if (!raw) {
        localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(INITIAL_ALERTS));
        return INITIAL_ALERTS;
      }
      return JSON.parse(raw);
    } catch {
      return INITIAL_ALERTS;
    }
  },

  getUnreadCount(): number {
    return this.getAll().filter((a) => !a.read).length;
  },

  add(alert: Omit<SystemAlert, "id" | "timestamp" | "timeMillis" | "read">): SystemAlert {
    const list = this.getAll();
    const newAlert: SystemAlert = {
      ...alert,
      id: `alert-${Date.now()}-${list.length + 1}`,
      timestamp: "Just now",
      timeMillis: Date.now(),
      read: false,
    };
    const updated = [newAlert, ...list].slice(0, 50);
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(updated));
    listeners.forEach((l) => l(updated));
    return newAlert;
  },

  markAsRead(id: string): void {
    const list = this.getAll().map((a) => (a.id === id ? { ...a, read: true } : a));
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(list));
    listeners.forEach((l) => l(list));
  },

  markAllAsRead(): void {
    const list = this.getAll().map((a) => ({ ...a, read: true }));
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(list));
    listeners.forEach((l) => l(list));
  },

  clearAll(): void {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify([]));
    listeners.forEach((l) => l([]));
  },

  subscribe(listener: AlertListener) {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  },

  /**
   * Rule Evaluation Engine:
   * Called whenever a transaction or balance change occurs to generate real-time alerts.
   */
  evaluateTxEvent(event: TxEvent): void {
    const settings = settingsStore.get();
    const amountNum = parseFloat(event.amount) || 0;

    // Rule 1: TX_FAILED
    if (event.status === "failed") {
      this.add({
        type: "TX_FAILED",
        title: "Transaction Reverted / Failed",
        message: `Transaction of ${event.amount} to ${event.to.slice(0, 10)}… reverted: ${event.error || "Execution failed"}`,
        severity: "high",
        txHash: event.txHash,
        targetAddress: event.to,
      });
    }

    // Rule 2: LARGE_TRANSFER
    if (amountNum >= settings.largeTransferThresholdEth && event.status === "confirmed") {
      this.add({
        type: "LARGE_TRANSFER",
        title: `High-Value Transfer: ${event.amount}`,
        message: `Transfer of ${event.amount} exceeding threshold (${settings.largeTransferThresholdEth} ETH) confirmed on-chain.`,
        severity: "medium",
        txHash: event.txHash,
        targetAddress: event.to,
      });
    }

    // Rule 3: UNKNOWN_ADDRESS_INTERACTION
    if (event.status === "confirmed" && event.to) {
      const isKnown = addressBook.resolve(event.to).isKnown;
      if (!isKnown) {
        this.add({
          type: "UNKNOWN_ADDRESS_INTERACTION",
          title: "Interaction with Unlabeled Address",
          message: `Transacted with unlabeled address ${event.to.slice(0, 12)}…. Consider adding it to your Address Book.`,
          severity: "low",
          targetAddress: event.to,
          txHash: event.txHash,
        });
      }
    }
  },

  evaluateBalance(balanceEth: string): void {
    const settings = settingsStore.get();
    const balNum = parseFloat(balanceEth);
    if (!isNaN(balNum) && balNum < settings.lowBalanceWarningEth) {
      // Avoid duplicate alert if already posted in last 10 minutes
      const existing = this.getAll().find(
        (a) => a.type === "LOW_BALANCE" && Date.now() - a.timeMillis < 600000
      );
      if (!existing) {
        this.add({
          type: "LOW_BALANCE",
          title: "Low Connected Wallet Balance",
          message: `Wallet balance (${balNum.toFixed(4)} ETH) has fallen below warning threshold (${settings.lowBalanceWarningEth} ETH).`,
          severity: "medium",
        });
      }
    }
  },

  evaluateGasPrice(gasPriceGwei: number): void {
    const settings = settingsStore.get();
    if (gasPriceGwei >= settings.gasSpikeThresholdGwei) {
      this.add({
        type: "GAS_SPIKE",
        title: "Gas Market Surge Detected",
        message: `Current gas price (${gasPriceGwei.toFixed(1)} Gwei) exceeds configured alert ceiling (${settings.gasSpikeThresholdGwei} Gwei).`,
        severity: "medium",
      });
    }
  },
};
