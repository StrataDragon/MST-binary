import { Response } from "express";
import { WebSocket } from "ws";
import { cfg } from "./config";

export interface TransactionItem {
  id: string;
  txHash: string;
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
  status: "confirmed" | "pending" | "failed";
  gasUsed?: string;
  blockNumber?: number;
  timestamp: string;
  timeMillis: number;
  jobId?: string;
  nodeType?: "normal" | "suspicious" | "mule" | "contract";
}

// Seed initial deployment/demo transactions so past txs are immediately queryable
const transactions: TransactionItem[] = [
  {
    id: "tx-seed-create",
    txHash: "0x33330991904adfb601488d3386664c26f5c483556b39e564023d27939dbb380d",
    from: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    to: cfg.addresses.JobEscrow,
    amount: "100.0 ETH",
    type: "escrow-deposit",
    status: "confirmed",
    gasUsed: "142,500 gas",
    blockNumber: 2,
    timestamp: "10m ago",
    timeMillis: Date.now() - 600000,
    jobId: "0x1c26461a043f824e848dfb0339143b57dfbbb3a7d98419a9f1dd40e9bdcf7615",
    nodeType: "contract",
  },
  {
    id: "tx-seed-register",
    txHash: "0x8c38f7785e6cb124d5f2ccbb0f29c573fe89f611402c4b75d70e1eb5d39b4c92",
    from: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    to: cfg.addresses.MachineRegistry,
    amount: "0.01 ETH",
    type: "transfer",
    status: "confirmed",
    gasUsed: "88,210 gas",
    blockNumber: 1,
    timestamp: "12m ago",
    timeMillis: Date.now() - 720000,
    nodeType: "contract",
  },
];

const sseClients = new Set<Response>();
const wsClients = new Set<WebSocket>();

export function getTransactions(): TransactionItem[] {
  return [...transactions].sort((a, b) => b.timeMillis - a.timeMillis);
}

export function recordAndEmitTx(tx: TransactionItem): void {
  // 1. Console log proving the backend emits each tx
  console.log(
    `[tx-emit] [${tx.type.toUpperCase()}] hash=${tx.txHash.slice(0, 14)}… from=${tx.from.slice(
      0,
      10
    )}… to=${tx.to.slice(0, 10)}… amount=${tx.amount} status=${tx.status}`
  );

  // 2. Prepend to in-memory store
  const existingIndex = transactions.findIndex((t) => t.txHash.toLowerCase() === tx.txHash.toLowerCase());
  if (existingIndex >= 0) {
    transactions[existingIndex] = tx;
  } else {
    transactions.unshift(tx);
    if (transactions.length > 100) transactions.pop();
  }

  // 3. Broadcast to SSE clients
  const sseData = `data: ${JSON.stringify(tx)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(sseData);
    } catch {
      sseClients.delete(client);
    }
  }

  // 4. Broadcast to WebSocket clients
  const wsData = JSON.stringify(tx);
  for (const client of wsClients) {
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.send(wsData);
      }
    } catch {
      wsClients.delete(client);
    }
  }
}

export function addSseClient(res: Response): () => void {
  sseClients.add(res);
  // Send initial connected ping
  res.write(`data: ${JSON.stringify({ type: "CONNECTED", count: transactions.length })}\n\n`);

  return () => {
    sseClients.delete(res);
  };
}

export function addWsClient(ws: WebSocket): () => void {
  wsClients.add(ws);
  try {
    ws.send(JSON.stringify({ type: "CONNECTED", count: transactions.length }));
  } catch {
    // ignore
  }

  return () => {
    wsClients.delete(ws);
  };
}
