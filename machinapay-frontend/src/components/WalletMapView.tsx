import React, { useState, useEffect } from "react";
import { formatEther } from "ethers";
import {
  Wallet,
  Cpu,
  Lock,
  Layers,
  Send,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Copy,
  Check,
  ArrowRight,
  Info,
  Clock,
  ExternalLink,
} from "lucide-react";
import { cfg } from "../lib/config";
import { sendEth, getLiveBalance } from "../lib/wallet";
import { eventBus, TxEvent } from "../lib/events";

interface WalletMapViewProps {
  signer: any;
  clientAddress: string | null;
  clientBalance: string;
  onRefreshBalances: () => void;
}

interface MapNode {
  id: string;
  name: string;
  shortLabel: string;
  type: "wallet" | "contract";
  address: string;
  balance: string;
  txCounts: { confirmed: number; pending: number; failed: number };
  status: "CONFIRMED" | "PENDING" | "FAILED";
  x: number;
  y: number;
  connectedNodes: string[];
}

export function WalletMapView({
  signer,
  clientAddress,
  clientBalance,
  onRefreshBalances,
}: WalletMapViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("client");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Live node balances
  const [machineBal, setMachineBal] = useState("10.0000");
  const [escrowBal, setEscrowBal] = useState("100.0000");
  const [registryBal, setRegistryBal] = useState("0.0000");

  // Transfer input form
  const [transferAmount, setTransferAmount] = useState("0.1");
  const [transferTarget, setTransferTarget] = useState<string>("machine");
  const [transferStatus, setTransferStatus] = useState<"idle" | "signing" | "pending" | "confirming" | "confirmed" | "failed">("idle");
  const [transferTxHash, setTransferTxHash] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  // Edge hover tooltip state
  const [hoveredEdge, setHoveredEdge] = useState<{ amount: string; gas: string; block: string; timestamp: string } | null>(null);

  // Recent transactions list
  const [recentTxs, setRecentTxs] = useState<TxEvent[]>([
    {
      id: "tx-init",
      txHash: "0x8c38f7785e6cb124d5f2ccbb0f29c573fe89f611402c4b75d70e1eb5d39b4c92",
      from: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      to: "0xcB00D7fF471334F2EeD249dF741C6E6c1B07aaf1",
      amount: "10.0 ETH",
      type: "transfer",
      status: "confirmed",
      gasUsed: "21,000 gas",
      blockNumber: 1,
      timestamp: "10m ago",
    },
  ]);

  // Read actual live balances from chain
  async function loadLiveBalances() {
    try {
      const machineAddress = "0xcB00D7fF471334F2EeD249dF741C6E6c1B07aaf1";
      const mB = await getLiveBalance(machineAddress);
      setMachineBal(mB);

      const eB = await getLiveBalance(cfg.addresses.JobEscrow);
      setEscrowBal(eB);

      const rB = await getLiveBalance(cfg.addresses.MachineRegistry);
      setRegistryBal(rB);
    } catch (e) {
      console.warn("Could not load node balances:", e);
    }
  }

  useEffect(() => {
    loadLiveBalances();
    const sub = eventBus.subscribe((evt) => {
      setRecentTxs((prev) => [evt, ...prev].slice(0, 15));
      loadLiveBalances();
    });
    return () => sub();
  }, []);

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  // Node specifications
  const nodes: MapNode[] = [
    {
      id: "client",
      name: "Client Wallet (Your Account)",
      shortLabel: "CLIENT",
      type: "wallet",
      address: clientAddress || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      balance: `${clientBalance || "100.00"} ETH`,
      txCounts: { confirmed: 18, pending: transferStatus === "pending" ? 1 : 0, failed: 0 },
      status: "CONFIRMED",
      x: 100,
      y: 110,
      connectedNodes: ["JobEscrow Contract", "Machine M-042"],
    },
    {
      id: "machine",
      name: "Machine Wallet (M-042 Agent)",
      shortLabel: "M-042",
      type: "wallet",
      address: "0xcB00D7fF471334F2EeD249dF741C6E6c1B07aaf1",
      balance: `${machineBal} ETH`,
      txCounts: { confirmed: 24, pending: 0, failed: 0 },
      status: "CONFIRMED",
      x: 340,
      y: 110,
      connectedNodes: ["Client Wallet", "JobEscrow Contract", "MachineRegistry"],
    },
    {
      id: "escrow",
      name: "JobEscrow Contract Vault",
      shortLabel: "ESCROW",
      type: "contract",
      address: cfg.addresses.JobEscrow,
      balance: `${escrowBal} ETH`,
      txCounts: { confirmed: 35, pending: 0, failed: 0 },
      status: "CONFIRMED",
      x: 100,
      y: 310,
      connectedNodes: ["Client Wallet", "Machine M-042", "MachineRegistry"],
    },
    {
      id: "registry",
      name: "MachineRegistry Contract",
      shortLabel: "REGISTRY",
      type: "contract",
      address: cfg.addresses.MachineRegistry,
      balance: `${registryBal} ETH`,
      txCounts: { confirmed: 12, pending: 0, failed: 0 },
      status: "CONFIRMED",
      x: 340,
      y: 310,
      connectedNodes: ["Machine M-042", "JobEscrow Contract"],
    },
  ];

  const activeNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  // Real on-chain ETH transfer execution
  async function handleSendEth() {
    if (!signer) {
      setTransferError("Connect wallet to execute transfer.");
      return;
    }
    const targetNode = nodes.find((n) => n.id === transferTarget);
    if (!targetNode) return;

    setTransferStatus("signing");
    setTransferError(null);
    const eventId = `tx-${Date.now()}`;

    try {
      // 1. Emit signing
      eventBus.emit({
        id: eventId,
        from: clientAddress || "You",
        to: targetNode.address,
        amount: `${transferAmount} ETH`,
        type: "transfer",
        status: "signing",
        timestamp: new Date().toLocaleTimeString(),
      });

      // 2. Real on-chain sendEth call
      const tx = await sendEth(signer, targetNode.address, transferAmount);
      setTransferTxHash(tx.hash);
      setTransferStatus("pending");

      eventBus.emit({
        id: eventId,
        txHash: tx.hash,
        from: clientAddress || "You",
        to: targetNode.address,
        amount: `${transferAmount} ETH`,
        type: "transfer",
        status: "pending",
        timestamp: new Date().toLocaleTimeString(),
      });

      // 3. Await receipt
      setTransferStatus("confirming");
      const receipt = await tx.wait();

      setTransferStatus("confirmed");
      eventBus.emit({
        id: eventId,
        txHash: tx.hash,
        from: clientAddress || "You",
        to: targetNode.address,
        amount: `${transferAmount} ETH`,
        type: "transfer",
        status: "confirmed",
        gasUsed: `${receipt?.gasUsed.toString()} gas`,
        blockNumber: receipt?.blockNumber,
        timestamp: new Date().toLocaleTimeString(),
      });

      onRefreshBalances();
      loadLiveBalances();
    } catch (err: any) {
      const msg = err?.reason || err?.message || "Transaction failed";
      setTransferError(msg);
      setTransferStatus("failed");

      eventBus.emit({
        id: eventId,
        from: clientAddress || "You",
        to: targetNode.address,
        amount: `${transferAmount} ETH`,
        type: "transfer",
        status: "failed",
        error: msg,
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* Top Header & Legend (SENTINEL Hospital Map Style) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary tracking-tight">
            Wallet Map & Transaction Flow Topology
          </h2>
          <p className="text-xs text-secondary">
            Interactive wallet and smart contract network · click a node for ledger telemetry
          </p>
        </div>

        {/* Legend & View Toggle */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-accent-green font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed
            </span>
            <span className="flex items-center gap-1.5 text-accent-amber font-semibold">
              <Clock className="w-3.5 h-3.5" /> Pending
            </span>
            <span className="flex items-center gap-1.5 text-accent-blue font-semibold">
              <Wallet className="w-3.5 h-3.5" /> Active Wallet
            </span>
            <span className="flex items-center gap-1.5 text-accent-red font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> Failed / Disputed
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: 7 cols Canvas Map, 5 cols Analytics & Transfer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): SVG Ward/Wallet Network Canvas */}
        <div className="lg:col-span-7 bg-card border border-border rounded-lg shadow-sm p-6 flex flex-col justify-between min-h-[460px] relative">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-secondary font-mono">
              Wallet-to-Wallet Transmission Network
            </h3>
            <span className="text-[11px] text-muted font-mono flex items-center gap-1">
              <Info className="w-3.5 h-3.5" /> Hover or click a node
            </span>
          </div>

          {/* Mobile Fallback Node List (for <= 640px) */}
          <div className="sm:hidden space-y-2 my-2">
            <span className="text-[10px] uppercase font-bold text-muted block">Network Node Roster</span>
            <div className="grid grid-cols-2 gap-2">
              {nodes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setSelectedNodeId(n.id)}
                  className={`p-2.5 rounded border text-left font-mono transition-all ${
                    selectedNodeId === n.id
                      ? "bg-page border-accent-blue shadow-xs"
                      : "bg-card border-border hover:bg-page"
                  }`}
                >
                  <div className="text-[11px] font-bold text-primary truncate">{n.name}</div>
                  <div className="text-[10px] text-accent-green font-bold">{n.balance} ETH</div>
                  <div className="text-[9px] text-muted truncate">{n.address.slice(0, 10)}…</div>
                </button>
              ))}
            </div>
          </div>

          {/* SVG Network Graph */}
          <div className="flex-1 flex items-center justify-center relative py-4 overflow-x-auto min-w-0">
            <svg width="440" height="420" className="overflow-visible select-none min-w-[440px]">
              {/* Edges between nodes */}
              {/* Edge 1: Client -> Machine */}
              <line
                x1={100}
                y1={110}
                x2={340}
                y2={110}
                stroke={transferStatus === "pending" || transferStatus === "confirming" ? "#F59E0B" : transferStatus === "confirmed" ? "#22C55E" : "#D1D5DB"}
                strokeWidth={transferStatus === "pending" ? "3" : "2"}
                strokeDasharray={transferStatus === "pending" ? "4 4" : "none"}
                className={transferStatus === "pending" ? "animate-pulse" : ""}
                onMouseEnter={() =>
                  setHoveredEdge({
                    amount: `${transferAmount} ETH`,
                    gas: "21,000 gas",
                    block: "MST Block #3",
                    timestamp: "Live Session",
                  })
                }
                onMouseLeave={() => setHoveredEdge(null)}
              />

              {/* Edge 2: Client -> Escrow */}
              <line x1={100} y1={110} x2={100} y2={310} stroke="#22C55E" strokeWidth="2" />

              {/* Edge 3: Escrow -> Machine */}
              <line x1={100} y1={310} x2={340} y2={110} stroke="#F59E0B" strokeWidth="1.8" strokeDasharray="3 3" />

              {/* Edge 4: Machine -> Registry */}
              <line x1={340} y1={110} x2={340} y2={310} stroke="#22C55E" strokeWidth="2" />

              {/* Edge 5: Escrow -> Registry */}
              <line x1={100} y1={310} x2={340} y2={310} stroke="#E5E7EB" strokeWidth="1.5" strokeDasharray="4 4" />

              {/* Animated pulse traveling along client -> machine edge if transfer is active */}
              {(transferStatus === "pending" || transferStatus === "confirming") && (
                <circle r="6" fill="#F59E0B" className="animate-ping">
                  <animateMotion path="M 100 110 L 340 110" dur="1.2s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Node Circles */}
              {nodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isClient = node.id === "client";

                return (
                  <g
                    key={node.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    {/* Glowing outer halo ring if selected (Sentinel style) */}
                    {isSelected && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="38"
                        fill="none"
                        stroke="#3B82F6"
                        strokeWidth="2.5"
                        opacity="0.9"
                        className="animate-pulse"
                      />
                    )}

                    {/* Dark/Accent node circle */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r="30"
                      fill="#0B0B0E"
                      stroke={isSelected ? "#3B82F6" : isClient ? "#3B82F6" : "#22C55E"}
                      strokeWidth="2.5"
                    />

                    {/* Node Text Label */}
                    <text
                      x={node.x}
                      y={node.y - 4}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="9.5"
                      fontWeight="bold"
                      fontFamily="ui-monospace, monospace"
                    >
                      {node.shortLabel}
                    </text>

                    {/* Balance Preview */}
                    <text
                      x={node.x}
                      y={node.y + 11}
                      textAnchor="middle"
                      fill="#22C55E"
                      fontSize="8"
                      fontWeight="600"
                      fontFamily="ui-monospace, monospace"
                    >
                      {node.balance.split(" ")[0]} ETH
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Edge Hover Tooltip (SENTINEL Style) */}
            {hoveredEdge && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 p-2.5 rounded-lg bg-[#111827] text-white text-[11px] font-mono shadow-xl space-y-0.5 pointer-events-none z-20 border border-gray-700">
                <div className="text-accent-amber font-bold">Active Transfer Edge (Client → M-042)</div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Payload:</span>
                  <span className="text-accent-green font-semibold">{hoveredEdge.amount}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Gas & Block:</span>
                  <span>{hoveredEdge.gas} · {hoveredEdge.block}</span>
                </div>
              </div>
            )}
          </div>

          <div className="p-2.5 rounded bg-page border border-border text-[11px] font-mono text-secondary flex items-center justify-between">
            <span>Direct Ledger Transmission Status:</span>
            <span className="font-bold text-accent-green">● 100% Cryptographic Verification</span>
          </div>
        </div>

        {/* Right Column (5 cols): Node Analytics & Real On-Chain Transfer Trigger */}
        <div className="lg:col-span-5 bg-card border border-border rounded-lg shadow-sm p-6 flex flex-col justify-between space-y-5">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-primary tracking-tight">
                  {activeNode.name}
                </h3>
                <span className="text-xs text-secondary font-mono">
                  {activeNode.type === "wallet" ? "Hardware / EOA Wallet" : "Smart Contract Vault"}
                </span>
              </div>
              <span className="pill-confirmed text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                {activeNode.status}
              </span>
            </div>

            {/* Address with Copy Button */}
            <div className="p-2.5 rounded-lg bg-page border border-border flex items-center justify-between text-xs font-mono mb-4">
              <span className="text-primary truncate mr-2">{activeNode.address}</span>
              <button
                onClick={() => handleCopy(activeNode.address, "addr")}
                className="text-secondary hover:text-primary flex-shrink-0"
              >
                {copiedKey === "addr" ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* 2x2 Metric Grid (Matching SENTINEL ER Ward Analytics) */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg border border-border bg-[#FAFAFB]">
                <span className="text-[10px] font-mono text-secondary uppercase block">Balance</span>
                <span className="text-sm font-bold font-mono text-primary">{activeNode.balance}</span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-[#FAFAFB]">
                <span className="text-[10px] font-mono text-secondary uppercase block">Confirmed Txs</span>
                <span className="text-sm font-bold font-mono text-accent-green">{activeNode.txCounts.confirmed}</span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-[#FAFAFB]">
                <span className="text-[10px] font-mono text-secondary uppercase block">Pending Txs</span>
                <span className="text-sm font-bold font-mono text-accent-amber">{activeNode.txCounts.pending}</span>
              </div>
              <div className="p-3 rounded-lg border border-border bg-[#FAFAFB]">
                <span className="text-[10px] font-mono text-secondary uppercase block">Failed / Reverted</span>
                <span className="text-sm font-bold font-mono text-accent-red">{activeNode.txCounts.failed}</span>
              </div>
            </div>

            {/* Connected Ledger Edges (Pills) */}
            <div className="space-y-1.5 mb-4">
              <span className="text-[11px] font-mono uppercase tracking-wide text-secondary block">
                Transfer Connections:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {activeNode.connectedNodes.map((n, idx) => (
                  <span key={idx} className="px-2.5 py-1 rounded bg-page border border-border text-[11px] font-mono text-primary">
                    {n}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ETH Wallet-to-Wallet Transfer Form */}
          <div className="pt-4 border-t border-border space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-primary font-mono block">
              Execute ETH Transfer Between Nodes
            </span>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-mono text-secondary block mb-1">Recipient</label>
                <select
                  value={transferTarget}
                  onChange={(e) => setTransferTarget(e.target.value)}
                  className="w-full bg-page border border-border rounded px-2.5 py-1.5 text-xs text-primary font-mono focus:outline-none focus:border-accent-blue"
                >
                  <option value="machine">Machine M-042</option>
                  <option value="escrow">JobEscrow Contract</option>
                  <option value="registry">MachineRegistry</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono text-secondary block mb-1">Amount (ETH)</label>
                <input
                  type="text"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className="w-full bg-page border border-border rounded px-2.5 py-1.5 text-xs text-primary font-mono focus:outline-none focus:border-accent-blue"
                />
              </div>
            </div>

            {transferError && (
              <div className="p-2 rounded bg-red-50 border border-red-200 text-xs text-accent-red font-mono">
                {transferError}
              </div>
            )}

            {transferTxHash && (
              <div className="p-2 rounded bg-green-50 border border-green-200 text-[11px] text-accent-green font-mono truncate">
                Tx: {transferTxHash}
              </div>
            )}

            <button
              onClick={handleSendEth}
              disabled={transferStatus === "signing" || transferStatus === "pending" || transferStatus === "confirming"}
              className="w-full py-2 rounded bg-accent-blue hover:bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {transferStatus === "signing"
                  ? "Sign in Wallet..."
                  : transferStatus === "pending" || transferStatus === "confirming"
                  ? "Confirming on Chain..."
                  : `Send ${transferAmount} ETH`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
