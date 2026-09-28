import React, { useState, useEffect } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { addressBook } from "../lib/addressBook";
import { priceFeed } from "../lib/priceFeed";
import { settingsStore } from "../lib/settings";
import { cfg } from "../lib/config";
import { TxEvent, eventBus } from "../lib/events";

export interface TxHistoryItem {
  id: string;
  txHash: string;
  timestamp: string;
  timeMillis: number;
  direction: "in" | "out";
  counterparty: string;
  amountEth: string;
  status: "confirmed" | "pending" | "failed";
  gasUsed: string;
  blockNumber: number;
  jobId?: string;
  nonce?: number;
  calldata?: string;
}

interface TransactionHistoryTableProps {
  clientAddress: string | null;
  onSelectTx: (tx: TxHistoryItem) => void;
}

export function TransactionHistoryTable({ clientAddress, onSelectTx }: TransactionHistoryTableProps) {
  // Initialize filter state from URL search params if present
  const urlParams = new URLSearchParams(window.location.search);

  const [statusFilter, setStatusFilter] = useState<string>(urlParams.get("tx_status") || "all");
  const [directionFilter, setDirectionFilter] = useState<string>(urlParams.get("tx_dir") || "all");
  const [minAmount, setMinAmount] = useState<string>(urlParams.get("tx_min") || "");
  const [maxAmount, setMaxAmount] = useState<string>(urlParams.get("tx_max") || "");
  const [escrowOnly, setEscrowOnly] = useState<boolean>(urlParams.get("tx_escrow") === "true");
  const [searchQuery, setSearchQuery] = useState<string>(urlParams.get("tx_q") || "");

  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 8;

  // Settings
  const [settings, setSettings] = useState(settingsStore.get());
  useEffect(() => {
    return settingsStore.subscribe(setSettings);
  }, []);

  // Sync filter changes back to URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (statusFilter !== "all") params.set("tx_status", statusFilter);
    else params.delete("tx_status");

    if (directionFilter !== "all") params.set("tx_dir", directionFilter);
    else params.delete("tx_dir");

    if (minAmount) params.set("tx_min", minAmount);
    else params.delete("tx_min");

    if (maxAmount) params.set("tx_max", maxAmount);
    else params.delete("tx_max");

    if (escrowOnly) params.set("tx_escrow", "true");
    else params.delete("tx_escrow");

    if (searchQuery) params.set("tx_q", searchQuery);
    else params.delete("tx_q");

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [statusFilter, directionFilter, minAmount, maxAmount, escrowOnly, searchQuery]);

  // Seeded mock transactions + live broadcast transactions from eventBus
  const [transactions, setTransactions] = useState<TxHistoryItem[]>([
    {
      id: "tx-seed-1",
      txHash: "0x17946b086b55376bf4acc37009bcbdbb3ace2382d51bec88b3f5454c3c8d57f1",
      timestamp: "1h ago",
      timeMillis: Date.now() - 3600000,
      direction: "out",
      counterparty: cfg.addresses.JobEscrow,
      amountEth: "100.00",
      status: "confirmed",
      gasUsed: "142,500 gas",
      blockNumber: 1,
      jobId: "0x795ee219624b1560c824b599c514da774a8e269c22278e5eac26d58c6ae8b807",
      nonce: 0,
      calldata: "createJob(bytes32,bytes32,uint256,string)",
    },
    {
      id: "tx-seed-2",
      txHash: "0xfd9987e33b9f9db27714fc2a6b684676b46e781eee8ab66ab129fa55dc8f09c8",
      timestamp: "1h ago",
      timeMillis: Date.now() - 3650000,
      direction: "out",
      counterparty: cfg.addresses.MachineRegistry,
      amountEth: "0.01",
      status: "confirmed",
      gasUsed: "88,210 gas",
      blockNumber: 1,
      nonce: 1,
      calldata: "registerMachine(string,address)",
    },
    {
      id: "tx-seed-3",
      txHash: "0x8c38f7785e6cb124d5f2ccbb0f29c573fe89f611402c4b75d70e1eb5d39b4c92",
      timestamp: "2h ago",
      timeMillis: Date.now() - 7200000,
      direction: "out",
      counterparty: "0xcB00D7fF471334F2EeD249dF741C6E6c1B07aaf1",
      amountEth: "10.00",
      status: "confirmed",
      gasUsed: "21,000 gas",
      blockNumber: 1,
      nonce: 2,
    },
  ]);

  useEffect(() => {
    const unsub = eventBus.subscribe((evt) => {
      if (evt.type === "transfer" && evt.txHash) {
        const item: TxHistoryItem = {
          id: evt.id,
          txHash: evt.txHash,
          timestamp: "Just now",
          timeMillis: Date.now(),
          direction: "out",
          counterparty: evt.to,
          amountEth: evt.amount.replace(" ETH", "").trim(),
          status: evt.status === "failed" ? "failed" : evt.status === "confirmed" ? "confirmed" : "pending",
          gasUsed: evt.gasUsed || "21,000 gas",
          blockNumber: evt.blockNumber || 1,
        };
        setTransactions((prev) => [item, ...prev]);
      }
    });
    return () => unsub();
  }, []);

  // Filter transactions
  const filteredTxs = transactions.filter((tx) => {
    if (statusFilter !== "all" && tx.status !== statusFilter) return false;
    if (directionFilter !== "all" && tx.direction !== directionFilter) return false;
    if (escrowOnly && !tx.jobId) return false;

    const amt = parseFloat(tx.amountEth) || 0;
    if (minAmount && amt < parseFloat(minAmount)) return false;
    if (maxAmount && amt > parseFloat(maxAmount)) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const resolved = addressBook.resolve(tx.counterparty);
      const match =
        tx.txHash.toLowerCase().includes(q) ||
        tx.counterparty.toLowerCase().includes(q) ||
        resolved.label.toLowerCase().includes(q) ||
        (tx.jobId && tx.jobId.toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredTxs.length / pageSize));
  const paginatedTxs = filteredTxs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const ethPrice = priceFeed.getCachedPrice();
  const isCompact = settings.displayDensity === "compact";

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm p-5 space-y-4 font-mono text-xs">
      {/* Header and Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h3 className="text-sm font-bold text-primary uppercase tracking-wider">
            Transaction History & On-Chain Audit
          </h3>
          <p className="text-xs text-secondary font-sans">
            Paginated ledger of all transfers, escrow deposits, and releases with counterparty resolution.
          </p>
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-page border border-border">
          {(["all", "confirmed", "pending", "failed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded text-[11px] uppercase font-bold transition-all ${
                statusFilter === s
                  ? "bg-card text-accent-blue shadow-xs border border-border"
                  : "text-secondary hover:text-primary"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Options Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tx, address, label..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-page border border-border rounded pl-8 pr-2 py-1.5 text-xs text-primary focus:outline-none focus:border-accent-blue"
          />
        </div>

        {/* Direction Filter */}
        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value)}
          className="bg-page border border-border rounded px-2.5 py-1.5 text-xs text-primary focus:outline-none focus:border-accent-blue"
        >
          <option value="all">Direction: All</option>
          <option value="out">Outgoing (Sent)</option>
          <option value="in">Incoming (Received)</option>
        </select>

        {/* Min/Max Amount Filter */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="Min ETH"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            className="w-1/2 bg-page border border-border rounded px-2 py-1.5 text-xs text-primary focus:outline-none focus:border-accent-blue"
          />
          <input
            type="text"
            placeholder="Max ETH"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            className="w-1/2 bg-page border border-border rounded px-2 py-1.5 text-xs text-primary focus:outline-none focus:border-accent-blue"
          />
        </div>

        {/* Escrow-linked Toggle */}
        <label className="flex items-center gap-2 cursor-pointer text-xs text-secondary font-sans select-none px-2 py-1 bg-page border border-border rounded">
          <input
            type="checkbox"
            checked={escrowOnly}
            onChange={(e) => setEscrowOnly(e.target.checked)}
            className="rounded accent-accent-blue"
          />
          <span>Escrow-linked only</span>
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border text-[11px] text-secondary uppercase">
              <th className={`px-3 ${isCompact ? "py-2" : "py-2.5"}`}>Time</th>
              <th className={`px-3 ${isCompact ? "py-2" : "py-2.5"}`}>Direction</th>
              <th className={`px-3 ${isCompact ? "py-2" : "py-2.5"}`}>Counterparty</th>
              <th className={`px-3 ${isCompact ? "py-2" : "py-2.5"}`}>Amount</th>
              <th className={`px-3 ${isCompact ? "py-2" : "py-2.5"}`}>Status</th>
              <th className={`px-3 ${isCompact ? "py-2" : "py-2.5"}`}>Gas Used</th>
              <th className={`px-3 ${isCompact ? "py-2" : "py-2.5"}`}>Job ID</th>
              <th className={`px-3 ${isCompact ? "py-2" : "py-2.5"} text-right`}>Block</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginatedTxs.map((tx) => {
              const party = addressBook.resolve(tx.counterparty);

              return (
                <tr
                  key={tx.id}
                  onClick={() => onSelectTx(tx)}
                  className="hover:bg-page cursor-pointer transition-colors"
                >
                  <td className={`px-3 text-secondary ${isCompact ? "py-2" : "py-3"}`}>{tx.timestamp}</td>

                  {/* Direction */}
                  <td className={`px-3 ${isCompact ? "py-2" : "py-3"}`}>
                    <span
                      className={`inline-flex items-center gap-1 font-bold ${
                        tx.direction === "out" ? "text-accent-amber" : "text-accent-green"
                      }`}
                    >
                      {tx.direction === "out" ? (
                        <>
                          <ArrowUpRight className="w-3 h-3" /> OUT
                        </>
                      ) : (
                        <>
                          <ArrowDownLeft className="w-3 h-3" /> IN
                        </>
                      )}
                    </span>
                  </td>

                  {/* Counterparty with Tooltip */}
                  <td className={`px-3 ${isCompact ? "py-2" : "py-3"}`}>
                    <div title={tx.counterparty}>
                      <span className="font-bold text-primary block truncate max-w-xs">{party.label}</span>
                      <span className="text-[10px] text-muted block truncate max-w-xs">{party.truncated}</span>
                    </div>
                  </td>

                  {/* Amount with USD subline */}
                  <td className={`px-3 ${isCompact ? "py-2" : "py-3"}`}>
                    <div>
                      <span className="font-bold text-primary block">{tx.amountEth} ETH</span>
                      <span className="text-[10px] text-muted block">
                        {priceFeed.toUsdString(tx.amountEth, ethPrice)}
                      </span>
                    </div>
                  </td>

                  {/* Status Pill */}
                  <td className={`px-3 ${isCompact ? "py-2" : "py-3"}`}>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        tx.status === "confirmed"
                          ? "pill-confirmed"
                          : tx.status === "failed"
                          ? "pill-failed"
                          : "pill-pending"
                      }`}
                    >
                      {tx.status}
                    </span>
                  </td>

                  <td className={`px-3 text-secondary ${isCompact ? "py-2" : "py-3"}`}>{tx.gasUsed}</td>

                  {/* Job ID */}
                  <td className={`px-3 ${isCompact ? "py-2" : "py-3"}`}>
                    {tx.jobId ? (
                      <span className="text-accent-blue truncate max-w-[100px] block" title={tx.jobId}>
                        {tx.jobId.slice(0, 10)}…
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>

                  <td className={`px-3 text-right text-secondary ${isCompact ? "py-2" : "py-3"}`}>
                    #{tx.blockNumber}
                  </td>
                </tr>
              );
            })}

            {paginatedTxs.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted">
                  No transactions match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between border-t border-border pt-3 text-[11px] text-secondary">
        <span>
          Showing {filteredTxs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{" "}
          {Math.min(currentPage * pageSize, filteredTxs.length)} of {filteredTxs.length} transactions
        </span>

        <div className="flex items-center gap-2">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="p-1 rounded border border-border bg-page hover:bg-gray-100 disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="p-1 rounded border border-border bg-page hover:bg-gray-100 disabled:opacity-40"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
