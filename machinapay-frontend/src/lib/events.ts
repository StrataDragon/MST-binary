import { MEMBER3_API_URL } from "./config";

export type TxStatus = "idle" | "signing" | "pending" | "confirming" | "confirmed" | "failed";

export interface TxEvent {
  id: string;
  txHash?: string;
  from: string;
  to: string;
  amount: string;
  type:
    | "transfer"
    | "escrow-deposit"
    | "escrow-accept"
    | "escrow-start"
    | "proof-submit"
    | "verifier-attest"
    | "escrow-release"
    | "escrow-refund";
  status: TxStatus;
  gasUsed?: string;
  blockNumber?: number;
  timestamp: string;
  timeMillis?: number;
  jobId?: string;
  error?: string;
  nodeType?: "customer" | "machine" | "contract" | "verifier";
}

type EventListener = (event: TxEvent) => void;
const listeners: EventListener[] = [];
let eventHistory: TxEvent[] = [];
let isInitialized = false;

export const eventBus = {
  subscribe(listener: EventListener) {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  },

  emit(event: TxEvent) {
    const exists = eventHistory.find((t) => t.txHash && t.txHash.toLowerCase() === event.txHash?.toLowerCase());
    if (exists) {
      Object.assign(exists, event);
    } else {
      eventHistory = [event, ...eventHistory].slice(0, 50);
    }
    listeners.forEach((l) => l(event));
  },

  getHistory(): TxEvent[] {
    return eventHistory;
  },
};

/**
 * Initializes the real-time live transaction feed via SSE and WebSocket,
 * fetching past transactions from GET /api/transactions on startup.
 */
export function initLiveTransactionFeed() {
  if (isInitialized) return;
  isInitialized = true;

  const httpUrl = MEMBER3_API_URL || "http://localhost:4000";
  const wsUrl = httpUrl.replace(/^http/, "ws");

  // 1. Fetch past transactions from GET /api/transactions
  fetch(`${httpUrl}/api/transactions`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((pastTxs: TxEvent[]) => {
      console.log(`[LIVE_TX_FEED] Loaded ${pastTxs.length} historical transactions from ${httpUrl}/api/transactions`);
      for (const tx of pastTxs.slice().reverse()) {
        eventBus.emit(tx);
      }
    })
    .catch((err) => {
      console.warn("[LIVE_TX_FEED] Could not load initial transactions:", err.message);
    });

  // 2. Open Server-Sent Events (SSE) Stream
  try {
    const sse = new EventSource(`${httpUrl}/api/transactions/stream`);

    sse.onopen = () => {
      console.log("[LIVE_TX_FEED] SSE connection established to", `${httpUrl}/api/transactions/stream`);
    };

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[LIVE_TX_FEED] Received transaction event:", data);
        if (data.txHash) {
          eventBus.emit(data);
        }
      } catch (e) {
        // ignore heartbeat / ping frames
      }
    };

    sse.onerror = () => {
      // EventSource auto-reconnects in modern browsers
    };
  } catch (err: any) {
    console.warn("[LIVE_TX_FEED] SSE initialization warning:", err.message);
  }

  // 3. Open WebSocket connection as redundant live transport
  try {
    const ws = new WebSocket(`${wsUrl}/api/transactions/ws`);

    ws.onopen = () => {
      console.log("[LIVE_TX_FEED] WebSocket connected to", `${wsUrl}/api/transactions/ws`);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[LIVE_TX_FEED] (WS) Received transaction event:", data);
        if (data.txHash) {
          eventBus.emit(data);
        }
      } catch (e) {
        // ignore ping frames
      }
    };
  } catch (err: any) {
    console.warn("[LIVE_TX_FEED] WebSocket initialization warning:", err.message);
  }
}
