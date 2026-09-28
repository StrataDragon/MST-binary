export type TxStatus = "idle" | "signing" | "pending" | "confirming" | "confirmed" | "failed";

export interface TxEvent {
  id: string;
  txHash?: string;
  from: string;
  to: string;
  amount: string;
  type: "transfer" | "escrow-deposit" | "escrow-release" | "escrow-refund";
  status: TxStatus;
  gasUsed?: string;
  blockNumber?: number;
  timestamp: string;
  error?: string;
}

type EventListener = (event: TxEvent) => void;
const listeners: EventListener[] = [];
let eventHistory: TxEvent[] = [];

export const eventBus = {
  subscribe(listener: EventListener) {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  },

  emit(event: TxEvent) {
    eventHistory = [event, ...eventHistory].slice(0, 50);
    listeners.forEach((l) => l(event));
  },

  getHistory(): TxEvent[] {
    return eventHistory;
  },
};
