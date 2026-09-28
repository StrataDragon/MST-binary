import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Sliders,
  Terminal,
  Plus,
  Trash2,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  ChevronDown,
  StopCircle,
} from "lucide-react";
import { cfg } from "../lib/config";
import { sendEth } from "../lib/wallet";
import { eventBus } from "../lib/events";
import { addressBook } from "../lib/addressBook";
import { executeBatchTransfers, BatchItem } from "../lib/batchSender";
import { formatEther } from "ethers";

interface TransactionLabViewProps {
  signer: any;
  clientAddress: string | null;
  selectedJobId: string | null;
  onRefresh: () => void;
}

export function TransactionLabView({
  signer,
  clientAddress,
  selectedJobId,
  onRefresh,
}: TransactionLabViewProps) {
  const [activeMode, setActiveMode] = useState<"single" | "batch">("single");

  // Single transfer form state
  const [recipient, setRecipient] = useState<string>("0xcB00D7fF471334F2EeD249dF741C6E6c1B07aaf1");
  const [amount, setAmount] = useState<string>("0.05");
  const [gasLimit, setGasLimit] = useState<string>("21000");
  const [gasPriceGwei, setGasPriceGwei] = useState<string>("20");
  const [singleBusy, setSingleBusy] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);

  // Batch transfer state
  const [batchItems, setBatchItems] = useState<BatchItem[]>([
    {
      id: "b-1",
      recipient: "0xcB00D7fF471334F2EeD249dF741C6E6c1B07aaf1",
      amount: "0.02",
      status: "idle",
    },
    {
      id: "b-2",
      recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: "0.03",
      status: "idle",
    },
  ]);
  const [isExecutingBatch, setIsExecutingBatch] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [runningGasCostWei, setRunningGasCostWei] = useState<bigint>(0n);
  const cancelBatchRef = useRef<boolean>(false);

  // Address book autocomplete options
  const addressBookEntries = addressBook.getAll();

  // Terminal console logs
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    `[SYS] MachinaPay Transaction Lab v1.0 connected to ${cfg.network} (ID ${cfg.chainId})`,
    `[RPC] RPC endpoint online at ${cfg.rpcUrl}`,
    `[KEY] Active signer: ${clientAddress || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"}`,
    `[READY] Configure transfer parameters on the left and click 'Execute Transaction'.`,
  ]);

  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = eventBus.subscribe((evt) => {
      const time = new Date().toLocaleTimeString();
      let logLine = `[${time}] ${evt.type.toUpperCase()} -> status=${evt.status}`;
      if (evt.txHash) logLine += ` tx=${evt.txHash.slice(0, 14)}…`;
      if (evt.gasUsed) logLine += ` gas=${evt.gasUsed}`;
      if (evt.error) logLine += ` ERR: ${evt.error}`;

      setTerminalLogs((prev) => [logLine, ...prev].slice(0, 35));
    });
    return () => unsub();
  }, []);

  // Single Transfer Runner
  async function handleRunSingleTransfer() {
    if (!signer) {
      setSingleError("Please connect your Web3 wallet first.");
      return;
    }
    setSingleBusy(true);
    setSingleError(null);
    const eventId = `tx-${Date.now()}`;
    const time = new Date().toLocaleTimeString();

    try {
      setTerminalLogs((prev) => [
        `[${time}] [TX_INIT] Preparing transfer of ${amount} ETH to ${addressBook.resolve(recipient).label}…`,
        ...prev,
      ]);

      eventBus.emit({
        id: eventId,
        from: clientAddress || "You",
        to: recipient,
        amount: `${amount} ETH`,
        type: "transfer",
        status: "signing",
        timestamp: time,
      });

      const tx = await sendEth(signer, recipient, amount);

      setTerminalLogs((prev) => [
        `[${time}] [TX_BROADCAST] Hash: ${tx.hash} (Awaiting 1 block confirmation)`,
        ...prev,
      ]);

      eventBus.emit({
        id: eventId,
        txHash: tx.hash,
        from: clientAddress || "You",
        to: recipient,
        amount: `${amount} ETH`,
        type: "transfer",
        status: "pending",
        timestamp: time,
      });

      const receipt = await tx.wait();

      setTerminalLogs((prev) => [
        `[${time}] [TX_MINED] Confirmed in block #${receipt?.blockNumber} with ${receipt?.gasUsed} gas!`,
        ...prev,
      ]);

      eventBus.emit({
        id: eventId,
        txHash: tx.hash,
        from: clientAddress || "You",
        to: recipient,
        amount: `${amount} ETH`,
        type: "transfer",
        status: "confirmed",
        gasUsed: `${receipt?.gasUsed} gas`,
        blockNumber: receipt?.blockNumber,
        timestamp: time,
      });

      onRefresh();
    } catch (err: any) {
      const msg = err?.reason || err?.message || "Transaction failed";
      setSingleError(msg);
      setTerminalLogs((prev) => [
        `[${time}] [TX_REVERT] Transaction failed or rejected: ${msg}`,
        ...prev,
      ]);

      eventBus.emit({
        id: eventId,
        from: clientAddress || "You",
        to: recipient,
        amount: `${amount} ETH`,
        type: "transfer",
        status: "failed",
        error: msg,
        timestamp: time,
      });
    } finally {
      setSingleBusy(false);
    }
  }

  // Batch Transfer Helpers
  function handleAddBatchRow() {
    setBatchItems([
      ...batchItems,
      {
        id: `b-${Date.now()}`,
        recipient: "",
        amount: "0.01",
        status: "idle",
      },
    ]);
  }

  function handleRemoveBatchRow(id: string) {
    setBatchItems(batchItems.filter((b) => b.id !== id));
  }

  function handleUpdateBatchRow(id: string, field: "recipient" | "amount", val: string) {
    setBatchItems(batchItems.map((b) => (b.id === id ? { ...b, [field]: val } : b)));
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const parsed: BatchItem[] = [];

      for (const line of lines) {
        const parts = line.split(",");
        if (parts.length >= 2) {
          const rec = parts[0].trim();
          const amt = parts[1].trim();
          if (rec.startsWith("0x")) {
            parsed.push({
              id: `b-${Date.now()}-${parsed.length}`,
              recipient: rec,
              amount: amt,
              status: "idle",
            });
          }
        }
      }

      if (parsed.length > 0) {
        setBatchItems(parsed);
      } else {
        setBatchError("Could not parse CSV. Expected format: recipient,amount");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // Sequential Batch Execution (Feature 3: strictly sequential to prevent nonce collisions!)
  async function handleExecuteBatch() {
    if (!signer) {
      setBatchError("Please connect wallet first.");
      return;
    }

    // Client-side validation
    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      if (!/^0x[a-fA-F0-9]{40}$/.test(item.recipient.trim())) {
        setBatchError(`Row ${i + 1} has invalid Ethereum address format`);
        return;
      }
      if (isNaN(parseFloat(item.amount)) || parseFloat(item.amount) <= 0) {
        setBatchError(`Row ${i + 1} has invalid transfer amount`);
        return;
      }
    }

    setBatchError(null);
    setIsExecutingBatch(true);
    cancelBatchRef.current = false;

    try {
      const state = await executeBatchTransfers(
        signer,
        clientAddress || "You",
        batchItems,
        {
          onRowUpdate: (index, updatedItem) => {
            setBatchItems((prev) => {
              const copy = [...prev];
              copy[index] = { ...updatedItem };
              return copy;
            });
          },
          onLog: (msg) => {
            setTerminalLogs((prev) => [msg, ...prev]);
          },
          onSummaryUpdate: (st) => {
            setRunningGasCostWei(st.runningGasCostWei);
          },
        },
        () => cancelBatchRef.current
      );
      setRunningGasCostWei(state.runningGasCostWei);
    } catch (err: any) {
      setBatchError(err?.message || "Batch execution error");
    } finally {
      setIsExecutingBatch(false);
      onRefresh();
    }
  }

  // Summary Metrics for Batch
  const totalQueuedEth = batchItems
    .reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0)
    .toFixed(4);
  const totalSentCount = batchItems.filter((b) => b.status === "confirmed").length;
  const totalFailedCount = batchItems.filter((b) => b.status === "failed").length;

  return (
    <div className="space-y-5 font-mono text-xs">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary tracking-tight">Transaction Lab</h2>
          <p className="text-xs text-secondary font-sans">
            Real-time on-chain transfers, sequential batch operations, and live terminal receipt stream.
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-page border border-border">
          <button
            onClick={() => setActiveMode("single")}
            className={`px-3 py-1 rounded text-xs font-bold transition-all ${
              activeMode === "single"
                ? "bg-card text-accent-blue shadow-xs border border-border"
                : "text-secondary hover:text-primary"
            }`}
          >
            Single Transfer
          </button>
          <button
            onClick={() => setActiveMode("batch")}
            className={`px-3 py-1 rounded text-xs font-bold transition-all ${
              activeMode === "batch"
                ? "bg-card text-accent-blue shadow-xs border border-border"
                : "text-secondary hover:text-primary"
            }`}
          >
            Batch Send ({batchItems.length})
          </button>
        </div>
      </div>

      {/* Main Grid: Left Controls (5 cols), Right Terminal (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 cols): Parameter Controls or Batch Queue */}
        <div className="lg:col-span-5 bg-card border border-border rounded-lg shadow-sm p-5 space-y-4">
          {/* Mode 1: Single Transfer */}
          {activeMode === "single" && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-secondary font-mono flex items-center gap-2 border-b border-border pb-2">
                <Sliders className="w-3.5 h-3.5 text-accent-blue" />
                <span>Single Transfer Parameters</span>
              </h3>

              <div>
                <label className="text-secondary text-[11px] block mb-1">From Wallet</label>
                <input
                  type="text"
                  disabled
                  value={clientAddress || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (Connected)"}
                  className="w-full bg-page border border-border rounded p-2 text-primary text-[11px]"
                />
              </div>

              {/* Recipient with Autocomplete from Address Book */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-secondary text-[11px]">Recipient Address</label>
                  <span className="text-[10px] text-accent-blue font-sans">
                    {addressBook.resolve(recipient).label}
                  </span>
                </div>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-page border border-border rounded p-2 text-primary text-[11px] focus:outline-none focus:border-accent-blue"
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {addressBookEntries.slice(0, 3).map((e) => (
                    <button
                      key={e.address}
                      type="button"
                      onClick={() => setRecipient(e.address)}
                      className="text-[10px] px-2 py-0.5 rounded bg-page border border-border hover:border-accent-blue text-secondary hover:text-primary transition-colors truncate max-w-[130px]"
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-secondary text-[11px] block mb-1">Amount ({cfg.nativeToken})</label>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-page border border-border rounded p-2 text-primary text-[11px] focus:outline-none focus:border-accent-blue"
                  />
                </div>

                <div>
                  <label className="text-secondary text-[11px] block mb-1">Gas Limit</label>
                  <input
                    type="text"
                    value={gasLimit}
                    onChange={(e) => setGasLimit(e.target.value)}
                    className="w-full bg-page border border-border rounded p-2 text-primary text-[11px] focus:outline-none focus:border-accent-blue"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-secondary text-[11px]">Gas Price (Gwei)</span>
                  <span className="font-bold text-primary">{gasPriceGwei} Gwei</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={gasPriceGwei}
                  onChange={(e) => setGasPriceGwei(e.target.value)}
                  className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-accent-blue"
                />
              </div>

              {singleError && (
                <div className="p-2 rounded bg-red-50 border border-red-200 text-xs text-accent-red font-mono">
                  {singleError}
                </div>
              )}

              <button
                onClick={handleRunSingleTransfer}
                disabled={singleBusy}
                className="w-full py-2.5 rounded bg-accent-blue hover:bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{singleBusy ? "Broadcasting to Ledger..." : `Execute ${amount} ETH Transfer`}</span>
              </button>
            </div>
          )}

          {/* Mode 2: Batch Send (Feature 3) */}
          {activeMode === "batch" && (
            <div className="space-y-4">
              {/* Batch Summary Bar */}
              <div className="p-3 rounded-lg bg-page border border-border grid grid-cols-5 gap-2 text-center text-[10px]">
                <div>
                  <span className="text-muted block uppercase">Queued</span>
                  <span className="font-bold text-primary text-xs">{totalQueuedEth} ETH</span>
                </div>
                <div>
                  <span className="text-muted block uppercase">Rows</span>
                  <span className="font-bold text-primary text-xs">{batchItems.length}</span>
                </div>
                <div>
                  <span className="text-muted block uppercase">Sent</span>
                  <span className="font-bold text-accent-green text-xs">{totalSentCount}</span>
                </div>
                <div>
                  <span className="text-muted block uppercase">Failed</span>
                  <span className="font-bold text-accent-red text-xs">{totalFailedCount}</span>
                </div>
                <div>
                  <span className="text-muted block uppercase">Gas Cost</span>
                  <span className="font-bold text-primary text-xs truncate block" title={`${runningGasCostWei.toString()} wei`}>
                    {runningGasCostWei > 0n ? `${formatEther(runningGasCostWei).slice(0, 7)} ETH` : "0.00 ETH"}
                  </span>
                </div>
              </div>

              {/* Batch Actions */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">
                  Transfer Queue
                </span>
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={csvInputRef}
                    onChange={handleCsvUpload}
                    accept=".csv"
                    className="hidden"
                  />
                  <button
                    onClick={() => csvInputRef.current?.click()}
                    className="flex items-center gap-1 px-2.5 py-1 rounded border border-border bg-page hover:bg-gray-100 text-xs text-secondary"
                  >
                    <Upload className="w-3 h-3" />
                    <span>CSV</span>
                  </button>
                  <button
                    onClick={handleAddBatchRow}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-page border border-border hover:border-accent-blue text-xs text-primary"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Row</span>
                  </button>
                </div>
              </div>

              {/* Batch Items List */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {batchItems.map((item, idx) => (
                  <div key={item.id} className="p-2.5 rounded border border-border bg-page space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-secondary">#{idx + 1}</span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            item.status === "confirmed"
                              ? "pill-confirmed"
                              : item.status === "failed"
                              ? "pill-failed"
                              : item.status === "pending"
                              ? "pill-pending"
                              : "bg-gray-200 text-secondary"
                          }`}
                        >
                          {item.status}
                        </span>
                        <button
                          disabled={isExecutingBatch}
                          onClick={() => handleRemoveBatchRow(item.id)}
                          className="text-muted hover:text-accent-red"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={item.recipient}
                        onChange={(e) => handleUpdateBatchRow(item.id, "recipient", e.target.value)}
                        placeholder="Recipient address (0x...)"
                        disabled={isExecutingBatch || item.status === "confirmed"}
                        className="col-span-2 bg-card border border-border rounded px-2 py-1 text-[11px] text-primary focus:outline-none focus:border-accent-blue disabled:opacity-60"
                      />
                      <input
                        type="text"
                        value={item.amount}
                        onChange={(e) => handleUpdateBatchRow(item.id, "amount", e.target.value)}
                        placeholder="Amount"
                        disabled={isExecutingBatch || item.status === "confirmed"}
                        className="bg-card border border-border rounded px-2 py-1 text-[11px] text-primary focus:outline-none focus:border-accent-blue disabled:opacity-60"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {batchError && (
                <div className="p-2 rounded bg-red-50 border border-red-200 text-[11px] text-accent-red">
                  {batchError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  disabled={isExecutingBatch || batchItems.length === 0}
                  onClick={handleExecuteBatch}
                  className="flex-1 py-2.5 rounded bg-accent-blue hover:bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isExecutingBatch
                      ? "Executing Sequential Transfers..."
                      : `Execute Batch (${batchItems.length} Transfers · ${totalQueuedEth} ETH)`}
                  </span>
                </button>
                {isExecutingBatch && (
                  <button
                    onClick={() => {
                      cancelBatchRef.current = true;
                      setTerminalLogs((prev) => [
                        "[USER_ACTION] Cancellation requested. Halting after current transaction completes...",
                        ...prev,
                      ]);
                    }}
                    className="px-3.5 py-2.5 rounded bg-accent-red hover:bg-red-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                    title="Stop submitting remaining transactions"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (7 cols): Terminal Log Console */}
        <div className="lg:col-span-7 bg-[#0B0B0E] border border-gray-800 rounded-lg shadow-sm p-4 font-mono text-xs flex flex-col justify-between min-h-[380px]">
          <div>
            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-3 text-gray-400 text-[11px]">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-accent-green" />
                <span>machinapay — live transaction telemetry log</span>
              </div>
              <span className="text-[10px] text-accent-green flex items-center gap-1">
                ● Live Stream
              </span>
            </div>

            <div className="space-y-1.5 text-gray-300 max-h-80 overflow-y-auto terminal-console pr-1 text-[11px]">
              {terminalLogs.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.includes("[TX_REVERT]") || log.includes("ERR") || log.includes("FAILED")
                      ? "text-accent-red"
                      : log.includes("[TX_MINED]") || log.includes("CONFIRMED")
                      ? "text-accent-green font-semibold"
                      : log.includes("[TX_BROADCAST]") || log.includes("PENDING") || log.includes("BATCH_")
                      ? "text-accent-amber"
                      : "text-gray-300"
                  }
                >
                  {log}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-gray-800 flex items-center justify-between text-[10px] text-gray-500">
            <span>Network: {cfg.network} ({cfg.chainId})</span>
            <span>Sequential Execution Engine: Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
