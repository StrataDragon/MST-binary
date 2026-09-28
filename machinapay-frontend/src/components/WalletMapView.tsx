import React, { useState, useEffect, useRef } from "react";
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
  Activity,
  Play,
  Pause,
  Maximize2,
  RefreshCw,
  ShieldAlert,
  Flame,
} from "lucide-react";
import { cfg } from "../lib/config";
import { sendEth, getLiveBalance } from "../lib/wallet";
import { eventBus, TxEvent } from "../lib/events";
import { addressBook } from "../lib/addressBook";

interface WalletMapViewProps {
  signer: any;
  clientAddress: string | null;
  clientBalance: string;
  onRefreshBalances: () => void;
}

export type NodeKind = "normal" | "suspicious" | "mule" | "contract";

export interface RadarNode {
  id: string;
  name: string;
  shortLabel: string;
  type: "wallet" | "contract";
  kind: NodeKind;
  address: string;
  balance: string;
  txCounts: { confirmed: number; pending: number; failed: number };
  status: "CONFIRMED" | "PENDING" | "FAILED";
  x: number;
  y: number;
}

export interface RadarEdge {
  id: string;
  from: string;
  to: string;
  amount: string;
  status: "confirmed" | "pending" | "failed";
  kind: NodeKind;
  timestamp: string;
}

export function WalletMapView({
  signer,
  clientAddress,
  clientBalance,
  onRefreshBalances,
}: WalletMapViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("client");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Animation controls
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [animationSpeed, setAnimationSpeed] = useState<number>(1);
  const [activePacket, setActivePacket] = useState<{
    from: RadarNode;
    to: RadarNode;
    amount: string;
    isMule: boolean;
  } | null>(null);

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

  // Dynamic Nodes & Edges State (initialized from seed, then dynamically populated)
  const [nodes, setNodes] = useState<RadarNode[]>([
    {
      id: "client",
      name: "Client Wallet (Your Account)",
      shortLabel: "CLIENT",
      type: "wallet",
      kind: "normal",
      address: clientAddress || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      balance: `${clientBalance || "100.00"} ETH`,
      txCounts: { confirmed: 18, pending: 0, failed: 0 },
      status: "CONFIRMED",
      x: 90,
      y: 110,
    },
    {
      id: "machine",
      name: "Machine Wallet (M-042 Autonomous Rover)",
      shortLabel: "M-042",
      type: "wallet",
      kind: "normal",
      address: "0xcB00D7fF471334F2EeD249dF741C6E6c1B07aaf1",
      balance: "10.00 ETH",
      txCounts: { confirmed: 24, pending: 0, failed: 0 },
      status: "CONFIRMED",
      x: 350,
      y: 110,
    },
    {
      id: "escrow",
      name: "JobEscrow Contract Vault",
      shortLabel: "ESCROW",
      type: "contract",
      kind: "contract",
      address: cfg.addresses.JobEscrow,
      balance: "100.00 ETH",
      txCounts: { confirmed: 35, pending: 0, failed: 0 },
      status: "CONFIRMED",
      x: 90,
      y: 310,
    },
    {
      id: "registry",
      name: "MachineRegistry Contract",
      shortLabel: "REGISTRY",
      type: "contract",
      kind: "contract",
      address: cfg.addresses.MachineRegistry,
      balance: "0.01 ETH",
      txCounts: { confirmed: 12, pending: 0, failed: 0 },
      status: "CONFIRMED",
      x: 350,
      y: 310,
    },
  ]);

  const [edges, setEdges] = useState<RadarEdge[]>([
    {
      id: "edge-client-escrow",
      from: "client",
      to: "escrow",
      amount: "100.0 ETH",
      status: "confirmed",
      kind: "normal",
      timestamp: "10m ago",
    },
    {
      id: "edge-client-machine",
      from: "client",
      to: "machine",
      amount: "10.0 ETH",
      status: "confirmed",
      kind: "normal",
      timestamp: "12m ago",
    },
    {
      id: "edge-escrow-machine",
      from: "escrow",
      to: "machine",
      amount: "100.0 ETH",
      status: "confirmed",
      kind: "normal",
      timestamp: "10m ago",
    },
    {
      id: "edge-machine-registry",
      from: "machine",
      to: "registry",
      amount: "0.01 ETH",
      status: "confirmed",
      kind: "normal",
      timestamp: "15m ago",
    },
  ]);

  // Transaction Feed list
  const [feedTxs, setFeedTxs] = useState<TxEvent[]>([]);

  // Function to dynamically add or update nodes and edges from incoming live transactions
  function addNodeAndEdgeFromTx(evt: TxEvent) {
    console.log("[RADAR] Dynamic graph update from incoming transaction:", evt);

    setNodes((prevNodes) => {
      const nextNodes = [...prevNodes];
      const isContractTo =
        evt.to.toLowerCase() === cfg.addresses.JobEscrow.toLowerCase() ||
        evt.to.toLowerCase() === cfg.addresses.MachineRegistry.toLowerCase();
      const isContractFrom =
        evt.from.toLowerCase() === cfg.addresses.JobEscrow.toLowerCase() ||
        evt.from.toLowerCase() === cfg.addresses.MachineRegistry.toLowerCase();

      const isMule = evt.nodeType === "mule" || evt.status === "failed";
      const isSuspicious = evt.nodeType === "suspicious" || evt.status === "pending";

      const kindTo: NodeKind = isContractTo ? "contract" : isMule ? "mule" : isSuspicious ? "suspicious" : "normal";
      const kindFrom: NodeKind = isContractFrom ? "contract" : isMule ? "mule" : isSuspicious ? "suspicious" : "normal";

      // 1. Ensure 'from' node exists
      let fromNode = nextNodes.find((n) => n.address.toLowerCase() === evt.from.toLowerCase());
      if (!fromNode) {
        const slot = nextNodes.length;
        const radius = 135;
        const angle = (slot * 55 * Math.PI) / 180;
        const cx = 220;
        const cy = 210;
        fromNode = {
          id: `node-${evt.from.slice(0, 6)}`,
          name: addressBook.resolve(evt.from).label,
          shortLabel: addressBook.resolve(evt.from).label.slice(0, 8).toUpperCase(),
          type: isContractFrom ? "contract" : "wallet",
          kind: kindFrom,
          address: evt.from,
          balance: "10.00 ETH",
          txCounts: { confirmed: 1, pending: 0, failed: 0 },
          status: isMule ? "FAILED" : "CONFIRMED",
          x: Math.round(cx + radius * Math.cos(angle)),
          y: Math.round(cy + radius * Math.sin(angle)),
        };
        nextNodes.push(fromNode);
      }

      // 2. Ensure 'to' node exists
      let toNode = nextNodes.find((n) => n.address.toLowerCase() === evt.to.toLowerCase());
      if (!toNode) {
        const slot = nextNodes.length;
        const radius = 135;
        const angle = ((slot * 55 + 30) * Math.PI) / 180;
        const cx = 220;
        const cy = 210;
        toNode = {
          id: `node-${evt.to.slice(0, 6)}`,
          name: addressBook.resolve(evt.to).label,
          shortLabel: addressBook.resolve(evt.to).label.slice(0, 8).toUpperCase(),
          type: isContractTo ? "contract" : "wallet",
          kind: kindTo,
          address: evt.to,
          balance: "5.00 ETH",
          txCounts: { confirmed: 1, pending: 0, failed: 0 },
          status: isMule ? "FAILED" : isSuspicious ? "PENDING" : "CONFIRMED",
          x: Math.round(cx + radius * Math.cos(angle)),
          y: Math.round(cy + radius * Math.sin(angle)),
        };
        nextNodes.push(toNode);
      } else {
        if (isMule) {
          toNode.kind = "mule";
          toNode.status = "FAILED";
        }
      }

      // Trigger packet animation between from and to nodes
      if (fromNode && toNode) {
        setActivePacket({
          from: fromNode,
          to: toNode,
          amount: evt.amount || "10 ETH",
          isMule,
        });
        setTimeout(() => setActivePacket(null), 2400 / animationSpeed);
      }

      return nextNodes;
    });

    // 3. Add or update edge
    setEdges((prevEdges) => {
      const edgeId = `edge-${evt.from.slice(0, 6)}-${evt.to.slice(0, 6)}`;
      const existing = prevEdges.find((e) => e.id === edgeId);
      const isMule = evt.nodeType === "mule" || evt.status === "failed";
      const isSuspicious = evt.nodeType === "suspicious" || evt.status === "pending";
      const kind: NodeKind = isMule ? "mule" : isSuspicious ? "suspicious" : "normal";

      if (existing) {
        return prevEdges.map((e) =>
          e.id === edgeId
            ? { ...e, amount: evt.amount || e.amount, status: evt.status as any, kind, timestamp: "Just now" }
            : e
        );
      }

      const newEdge: RadarEdge = {
        id: edgeId,
        from: evt.from,
        to: evt.to,
        amount: evt.amount || "10.0 ETH",
        status: evt.status as any,
        kind,
        timestamp: "Just now",
      };
      return [...prevEdges, newEdge];
    });

    // 4. Prepend to live transaction feed
    setFeedTxs((prev) => {
      const filtered = prev.filter((t) => t.txHash !== evt.txHash);
      return [evt, ...filtered].slice(0, 20);
    });
  }

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

  // Subscribe to live transactions from eventBus (which gets fed by SSE + WS + on-chain events)
  useEffect(() => {
    loadLiveBalances();

    // Populate initial feed from eventBus history
    const initialHistory = eventBus.getHistory();
    if (initialHistory.length > 0) {
      setFeedTxs(initialHistory);
      for (const evt of initialHistory) {
        addNodeAndEdgeFromTx(evt);
      }
    }

    const unsub = eventBus.subscribe((evt) => {
      addNodeAndEdgeFromTx(evt);
      loadLiveBalances();
    });

    return () => unsub();
  }, []);

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

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
      eventBus.emit({
        id: eventId,
        from: clientAddress || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        to: targetNode.address,
        amount: `${transferAmount} ETH`,
        type: "transfer",
        status: "signing",
        timestamp: new Date().toLocaleTimeString(),
      });

      const tx = await sendEth(signer, targetNode.address, transferAmount);
      setTransferTxHash(tx.hash);
      setTransferStatus("pending");

      eventBus.emit({
        id: eventId,
        txHash: tx.hash,
        from: clientAddress || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        to: targetNode.address,
        amount: `${transferAmount} ETH`,
        type: "transfer",
        status: "pending",
        timestamp: new Date().toLocaleTimeString(),
      });

      setTransferStatus("confirming");
      const receipt = await tx.wait();

      setTransferStatus("confirmed");
      eventBus.emit({
        id: eventId,
        txHash: tx.hash,
        from: clientAddress || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
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
        from: clientAddress || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        to: targetNode.address,
        amount: `${transferAmount} ETH`,
        type: "transfer",
        status: "failed",
        error: msg,
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  }

  // Trigger test live transaction broadcast via backend endpoint
  async function triggerSimulation(type: "normal" | "mule") {
    try {
      const pseudoWallet =
        type === "mule"
          ? "0x9965507D1a55bcC2695C58ba16FB37d819B0A4df"
          : "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
      const res = await fetch("http://localhost:4000/api/transactions/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: clientAddress || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          to: pseudoWallet,
          amount: type === "mule" ? "25.0 ETH" : "5.0 ETH",
          type: "transfer",
          nodeType: type,
          status: type === "mule" ? "failed" : "confirmed",
        }),
      });
      const data = await res.json();
      console.log("[SIMULATE] Broadcast response:", data);
    } catch (err) {
      console.error("Simulation error:", err);
    }
  }

  const activeNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];
  const muleCount = nodes.filter((n) => n.kind === "mule").length;

  return (
    <div className="space-y-5 font-sans">
      {/* Top Header & Typology Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent-blue" />
            <h2 className="text-base font-bold text-primary tracking-wider uppercase font-mono">
              TYPOLOGY RADAR — WALLET MAP & TRANSACTION TOPOLOGY
            </h2>
            <span className="pill-confirmed text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
              LIVE
            </span>
            {muleCount > 0 && (
              <span className="pill-failed text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                <ShieldAlert className="w-3 h-3 text-accent-red" />
                {muleCount} MULE NODE DETECTED
              </span>
            )}
          </div>
          <p className="text-xs text-secondary font-mono mt-0.5">
            Real-time graph canvas · Cyan = Normal · Orange = Suspicious · Red = Mule Aggregator · Purple = Contract
          </p>
        </div>

        {/* Small UI Pill Controls & Stats Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Stats chips */}
          <span className="px-2.5 py-1 rounded-full bg-[#111827] text-white/90 border border-gray-700 text-[10px] font-mono">
            {nodes.length} nodes
          </span>
          <span className="px-2.5 py-1 rounded-full bg-[#111827] text-white/90 border border-gray-700 text-[10px] font-mono">
            {edges.length} edges
          </span>

          {/* Action pills: Fit, Clear, Play/Pause, Replay, Speed */}
          <button
            onClick={() => setSelectedNodeId("client")}
            className="px-3 py-1 rounded-full bg-[#111827] hover:bg-gray-800 text-white font-mono text-xs border border-gray-700 flex items-center gap-1 transition-colors"
          >
            <Maximize2 className="w-3 h-3 text-cyan-400" />
            <span>Fit</span>
          </button>

          <button
            onClick={() => {
              setEdges([]);
              setFeedTxs([]);
            }}
            className="px-3 py-1 rounded-full bg-[#111827] hover:bg-gray-800 text-white font-mono text-xs border border-gray-700 transition-colors"
          >
            Clear
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-2.5 py-1 rounded-full bg-[#111827] hover:bg-gray-800 text-white font-mono text-xs border border-gray-700 transition-colors"
            title={isPlaying ? "Pause Flow" : "Play Flow"}
          >
            {isPlaying ? <Pause className="w-3 h-3 text-accent-amber" /> : <Play className="w-3 h-3 text-accent-green" />}
          </button>

          <button
            onClick={() => {
              if (nodes.length >= 2) {
                setActivePacket({
                  from: nodes[0],
                  to: nodes[1],
                  amount: "10.0 ETH",
                  isMule: false,
                });
                setTimeout(() => setActivePacket(null), 2000);
              }
            }}
            className="px-2.5 py-1 rounded-full bg-[#111827] hover:bg-gray-800 text-white font-mono text-xs border border-gray-700 transition-colors"
            title="Replay Packet Animation"
          >
            <RotateCcw className="w-3 h-3 text-cyan-400" />
          </button>

          <button
            onClick={() => setAnimationSpeed((s) => (s === 1 ? 2 : 1))}
            className="px-2.5 py-1 rounded-full bg-[#111827] hover:bg-gray-800 text-cyan-400 font-mono text-[10px] font-bold border border-gray-700"
            title="Toggle Animation Speed"
          >
            {animationSpeed}x
          </button>

          {/* Quick Simulation Triggers */}
          <button
            onClick={() => triggerSimulation("normal")}
            className="px-2.5 py-1 rounded-full bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 font-mono text-[10px] transition-colors"
            title="Simulate Normal Flow"
          >
            + Normal
          </button>
          <button
            onClick={() => triggerSimulation("mule")}
            className="px-2.5 py-1 rounded-full bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-700/60 font-mono text-[10px] transition-colors"
            title="Simulate Flagged Mule Node"
          >
            + Mule Node
          </button>
        </div>
      </div>

      {/* Main Grid: 7 cols Dark Graph Canvas, 5 cols Transaction Feed & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Dark Graph Canvas */}
        <div className="lg:col-span-7 bg-[#0B0B0E] border border-[#1E1E24] rounded-lg shadow-sm p-5 flex flex-col justify-between min-h-[480px] relative overflow-hidden select-none">
          {/* Canvas Sub-Header */}
          <div className="flex items-center justify-between border-b border-[#1E1E24] pb-2.5 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#9CA3AF]">
                TOPOLOGY RADAR CANVAS
              </span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-400 border border-cyan-800/50">
                ACTIVE MESH
              </span>
            </div>
            <span className="text-[10px] text-[#6B7280] font-mono">
              Click node to inspect ledger parameters
            </span>
          </div>

          {/* SVG Canvas Area */}
          <div className="flex-1 flex items-center justify-center relative py-2 overflow-x-auto min-w-0">
            <svg width="450" height="420" className="overflow-visible min-w-[450px]">
              <defs>
                {/* Arrowhead marker for edges */}
                <marker id="radar-arrow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#0891b2" />
                </marker>
                <marker id="radar-arrow-mule" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
                </marker>

                {/* Soft glow filter */}
                <filter id="cyan-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="mule-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Background grid dots */}
              <pattern id="radar-dots" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="#1f2937" opacity="0.6" />
              </pattern>
              <rect width="450" height="420" fill="url(#radar-dots)" />

              {/* Dynamic Edges */}
              {edges.map((edge) => {
                const fromNode = nodes.find((n) => n.id === edge.from || n.address.toLowerCase() === edge.from.toLowerCase());
                const toNode = nodes.find((n) => n.id === edge.to || n.address.toLowerCase() === edge.to.toLowerCase());
                if (!fromNode || !toNode) return null;

                const isMuleEdge = edge.kind === "mule" || toNode.kind === "mule";
                const isSuspicious = edge.kind === "suspicious" || toNode.kind === "suspicious";

                const strokeColor = isMuleEdge ? "#ef4444" : isSuspicious ? "#f59e0b" : "#0891b2";
                const markerId = isMuleEdge ? "url(#radar-arrow-mule)" : "url(#radar-arrow)";
                const pathD = `M ${fromNode.x} ${fromNode.y} L ${toNode.x} ${toNode.y}`;

                return (
                  <g key={edge.id}>
                    {/* Semi-transparent line */}
                    <path
                      d={pathD}
                      stroke={strokeColor}
                      strokeWidth="2"
                      strokeOpacity="0.45"
                      fill="none"
                      markerEnd={markerId}
                      className="cursor-pointer hover:stroke-opacity-100 transition-all"
                      onMouseEnter={() =>
                        setHoveredEdge({
                          amount: edge.amount,
                          gas: "21,000 gas",
                          block: "MST Confirmed",
                          timestamp: edge.timestamp,
                        })
                      }
                      onMouseLeave={() => setHoveredEdge(null)}
                    />

                    {/* Tiny moving dot showing fund flow */}
                    {isPlaying && (
                      <circle r="2.5" fill={isMuleEdge ? "#ef4444" : "#22d3ee"}>
                        <animateMotion
                          path={pathD}
                          dur={`${(2.2 / animationSpeed).toFixed(1)}s`}
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                  </g>
                );
              })}

              {/* Active Packet Animation (larger glowing dot + amount label) */}
              {activePacket && (
                <g>
                  <circle
                    r="5"
                    fill={activePacket.isMule ? "#ef4444" : "#22d3ee"}
                    filter={activePacket.isMule ? "url(#mule-glow)" : "url(#cyan-glow)"}
                  >
                    <animateMotion
                      path={`M ${activePacket.from.x} ${activePacket.from.y} L ${activePacket.to.x} ${activePacket.to.y}`}
                      dur={`${(2.0 / animationSpeed).toFixed(1)}s`}
                      repeatCount="1"
                    />
                  </circle>
                  <text
                    fontSize="9"
                    fontFamily="monospace"
                    fill="#e5e7eb"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    <animateMotion
                      path={`M ${activePacket.from.x} ${activePacket.from.y - 10} L ${activePacket.to.x} ${activePacket.to.y - 10}`}
                      dur={`${(2.0 / animationSpeed).toFixed(1)}s`}
                      repeatCount="1"
                    />
                    {activePacket.amount}
                  </text>
                </g>
              )}

              {/* Dynamic Nodes */}
              {nodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isContract = node.type === "contract";
                const isMule = node.kind === "mule";
                const isSuspicious = node.kind === "suspicious";

                const nodeColor = isMule ? "#ef4444" : isSuspicious ? "#f59e0b" : isContract ? "#8b5cf6" : "#06b6d4";

                return (
                  <g
                    key={node.id}
                    className="cursor-pointer group"
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    {/* Soft red glow / pulse ring on mule nodes */}
                    {isMule && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="34"
                        fill="rgba(239, 68, 68, 0.2)"
                        stroke="#ef4444"
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        className="animate-pulse"
                      />
                    )}

                    {/* Outer selection ring if selected */}
                    {isSelected && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="30"
                        fill="none"
                        stroke={nodeColor}
                        strokeWidth="2.5"
                        opacity="0.9"
                        className="animate-pulse"
                      />
                    )}

                    {/* Shape: Rounded square for contract nodes, circle for wallet nodes */}
                    {isContract ? (
                      <rect
                        x={node.x - 20}
                        y={node.y - 20}
                        width="40"
                        height="40"
                        rx="8"
                        fill="#111827"
                        stroke={nodeColor}
                        strokeWidth="2"
                        className="transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="22"
                        fill="#0B0B0E"
                        stroke={nodeColor}
                        strokeWidth="2"
                        className="transition-transform group-hover:scale-105"
                      />
                    )}

                    {/* Node Short Label */}
                    <text
                      x={node.x}
                      y={isContract ? node.y - 2 : node.y - 1}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="8.5"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {node.shortLabel}
                    </text>

                    {/* Status Dot inside node */}
                    <circle
                      cx={node.x}
                      cy={node.y + 9}
                      r="2.5"
                      fill={nodeColor}
                    />

                    {/* Monospace label placed just below each node */}
                    <text
                      x={node.x}
                      y={node.y + 32}
                      textAnchor="middle"
                      fill="#9CA3AF"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="500"
                    >
                      {node.name.split(" ")[0]}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Edge Tooltip */}
            {hoveredEdge && (
              <div className="absolute top-8 left-1/2 -translate-x-1/2 p-2.5 rounded bg-[#111827] text-white text-[11px] font-mono shadow-xl space-y-0.5 pointer-events-none z-20 border border-gray-700">
                <div className="text-cyan-400 font-bold">Fund Transmission Edge</div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Payload:</span>
                  <span className="text-accent-green font-semibold">{hoveredEdge.amount}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Status & Block:</span>
                  <span>{hoveredEdge.gas} · {hoveredEdge.block}</span>
                </div>
              </div>
            )}
          </div>

          {/* Full Legend matching all node types & states */}
          <div className="pt-3 border-t border-[#1E1E24] flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono text-[#9CA3AF]">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Normal (Cyan)
              </span>
              <span className="flex items-center gap-1.5 text-accent-amber font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-amber" /> Suspicious (Orange)
              </span>
              <span className="flex items-center gap-1.5 text-accent-red font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-red animate-pulse" /> Mule Aggregator (Red)
              </span>
              <span className="flex items-center gap-1.5 text-purple-400 font-semibold">
                <span className="w-2.5 h-2.5 rounded-xs bg-purple-500" /> Contract Vault (Purple)
              </span>
              <span className="flex items-center gap-1.5 text-cyan-300">
                <span className="w-4 h-0.5 bg-cyan-500" /> Fund Flow Edge
              </span>
            </div>
            <span className="text-accent-green font-bold">● SSE Stream Synchronized</span>
          </div>
        </div>

        {/* Right Column (5 cols): Transaction Feed Panel & Transfer Controls */}
        <div className="lg:col-span-5 space-y-4">
          {/* 1. Transaction Feed Panel (Dark card matching canvas, monospace text, colored rows) */}
          <div className="bg-[#0B0B0E] border border-[#1E1E24] rounded-lg shadow-sm p-4 font-mono text-xs flex flex-col justify-between min-h-[260px]">
            <div>
              <div className="flex items-center justify-between border-b border-[#1E1E24] pb-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-accent-blue" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    TYPOLOGY TRANSACTION FEED
                  </span>
                </div>
                <span className="text-[10px] text-accent-green font-semibold">
                  ● Real-time
                </span>
              </div>

              {/* Feed items */}
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {feedTxs.map((tx, idx) => {
                  const isMule = tx.nodeType === "mule" || tx.status === "failed";
                  const isPending = tx.status === "pending" || tx.nodeType === "suspicious";

                  const toneClass = isMule
                    ? "border-red-900/60 bg-red-950/30 text-red-400"
                    : isPending
                    ? "border-amber-900/60 bg-amber-950/30 text-amber-400"
                    : "border-cyan-900/60 bg-cyan-950/20 text-cyan-300";

                  return (
                    <div
                      key={tx.id || idx}
                      className={`p-2 rounded border flex items-center justify-between text-[11px] font-mono transition-all ${toneClass}`}
                    >
                      <div className="truncate mr-2">
                        <div className="font-bold flex items-center gap-1.5">
                          <span className="uppercase text-[9px] px-1.5 py-0.2 rounded bg-black/40 border border-white/10">
                            {tx.type}
                          </span>
                          <span className="truncate">{tx.txHash ? `${tx.txHash.slice(0, 10)}…` : "Pending tx"}</span>
                        </div>
                        <div className="text-[10px] opacity-75 truncate mt-0.5">
                          From: {tx.from.slice(0, 8)}… → To: {tx.to.slice(0, 8)}…
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="font-bold block">{tx.amount}</span>
                        <span className="text-[9px] uppercase opacity-75 block">{tx.status}</span>
                      </div>
                    </div>
                  );
                })}

                {feedTxs.length === 0 && (
                  <div className="py-8 text-center text-[#6B7280]">
                    Listening for on-chain & simulated transactions…
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-[#1E1E24] text-[10px] text-[#6B7280] flex justify-between">
              <span>Feed buffer: {feedTxs.length} items</span>
              <span>Transport: SSE / WS :4000</span>
            </div>
          </div>

          {/* 2. Selected Node Inspector & ETH Transfer Panel */}
          <div className="bg-card border border-border rounded-lg shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-primary tracking-tight font-mono">
                  {activeNode.name}
                </h3>
                <span className="text-[11px] text-secondary font-mono">
                  {activeNode.type === "wallet" ? "Hardware / EOA Node" : "Smart Contract Vault"}
                </span>
              </div>
              <span
                className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  activeNode.kind === "mule"
                    ? "pill-failed"
                    : activeNode.kind === "suspicious"
                    ? "pill-pending"
                    : "pill-confirmed"
                }`}
              >
                {activeNode.status}
              </span>
            </div>

            {/* Address with Copy */}
            <div className="p-2 rounded bg-page border border-border flex items-center justify-between text-[11px] font-mono">
              <span className="text-primary truncate mr-2">{activeNode.address}</span>
              <button
                onClick={() => handleCopy(activeNode.address, "addr")}
                className="text-secondary hover:text-primary flex-shrink-0"
              >
                {copiedKey === "addr" ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Metric grid */}
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="p-2 rounded border border-border bg-[#FAFAFB]">
                <span className="text-[10px] text-secondary block">Balance</span>
                <span className="font-bold text-primary">{activeNode.balance}</span>
              </div>
              <div className="p-2 rounded border border-border bg-[#FAFAFB]">
                <span className="text-[10px] text-secondary block">Transactions</span>
                <span className="font-bold text-accent-green">{activeNode.txCounts.confirmed} confirmed</span>
              </div>
            </div>

            {/* On-Chain ETH Transfer Trigger */}
            <div className="pt-2 border-t border-border space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary font-mono block">
                Execute On-Chain Transfer
              </span>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-mono text-secondary block mb-1">Target</label>
                  <select
                    value={transferTarget}
                    onChange={(e) => setTransferTarget(e.target.value)}
                    className="w-full bg-page border border-border rounded px-2 py-1 text-xs text-primary font-mono focus:outline-none focus:border-accent-blue"
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
                    className="w-full bg-page border border-border rounded px-2 py-1 text-xs text-primary font-mono focus:outline-none focus:border-accent-blue"
                  />
                </div>
              </div>

              {transferError && (
                <div className="p-1.5 rounded bg-red-50 border border-red-200 text-xs text-accent-red font-mono">
                  {transferError}
                </div>
              )}

              {transferTxHash && (
                <div className="p-1.5 rounded bg-green-50 border border-green-200 text-[10px] text-accent-green font-mono truncate">
                  Tx: {transferTxHash}
                </div>
              )}

              <button
                onClick={handleSendEth}
                disabled={transferStatus === "signing" || transferStatus === "pending" || transferStatus === "confirming"}
                className="w-full py-1.5 rounded bg-accent-blue hover:bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 shadow-sm"
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
    </div>
  );
}
