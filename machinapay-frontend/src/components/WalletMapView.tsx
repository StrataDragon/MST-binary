import React, { useState, useEffect, useRef } from "react";
import { formatEther, parseEther, encodeBytes32String, decodeBytes32String, keccak256, toUtf8Bytes } from "ethers";
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
  ExternalLink,
  ShieldCheck,
  Maximize2,
  Filter,
} from "lucide-react";
import { cfg, NATIVE_SYMBOL, MEMBER3_API_URL } from "../lib/config";
import { getReadProvider, getEscrow, getRegistry, decodeContractError } from "../lib/wallet";

function withTimeout<T>(promise: Promise<T>, ms = 12000, errorMsg = "RPC request timed out"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
  ]);
}

interface WalletMapViewProps {
  signer: any;
  clientAddress: string | null;
  clientBalance: string;
  onRefreshBalances: () => void;
}

export type NodeKind = "customer" | "machine" | "contract" | "verifier";

export interface MapNode {
  id: string;
  label: string;
  subLabel?: string;
  kind: NodeKind;
  address: string;
  balance: string;
  x: number;
  y: number;
  details?: Record<string, string | number | boolean>;
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  action: string;
  amount?: string;
  txHash?: string;
  activeUntil?: number; // timestamp until active animation ends
  isPending?: boolean;
  isError?: boolean;
  errorMessage?: string;
}

export interface FeedEventItem {
  id: string;
  name: string;
  txHash: string;
  blockNumber: number;
  timestamp: string;
  from?: string;
  to?: string;
  amount?: string;
  summary: string;
}

export function WalletMapView({
  signer,
  clientAddress,
  clientBalance,
  onRefreshBalances,
}: WalletMapViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("customer");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Filter events to connected address
  const [filterMyEvents, setFilterMyEvents] = useState<boolean>(false);

  // Nodes & Edges
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [edges, setEdges] = useState<MapEdge[]>([]);
  const [eventsFeed, setEventsFeed] = useState<FeedEventItem[]>([]);
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const [activeEdgePacket, setActiveEdgePacket] = useState<{ edgeId: string; amount?: string; txHash?: string } | null>(null);

  // Loading & error states
  const [loading, setLoading] = useState<boolean>(true);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState<boolean>(false);

  // Create Job Form inside Right Panel
  const [formDescription, setFormDescription] = useState("Autonomous transport package delivery");
  const [formReward, setFormReward] = useState("10");
  const [formDurationMinutes, setFormDurationMinutes] = useState("60");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formTxStatus, setFormTxStatus] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // SVG viewport
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 960, height: 560 });

  function copyText(key: string, val: string) {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  // 1. Initial Load from Chain (Nodes + queryFilter for recent events)
  async function loadChainData() {
    setLoading(true);
    setRpcError(null);
    try {
      const provider = getReadProvider();
      // Health check to ensure RPC is reachable
      await withTimeout(provider.getBlockNumber(), 10000, "Can't reach RPC");
      const registry = getRegistry(provider);
      const escrow = getEscrow(provider);

      // Fetch escrow & registry balances with timeout
      const [escrowBalRaw, registryBalRaw] = await Promise.all([
        withTimeout(provider.getBalance(cfg.addresses.JobEscrow), 10000, "Escrow balance timeout").catch(() => 0n),
        withTimeout(provider.getBalance(cfg.addresses.MachineRegistry), 10000, "Registry balance timeout").catch(() => 0n),
      ]);
      const escrowBal = formatEther(escrowBalRaw);
      const registryBal = formatEther(registryBalRaw);

      // Fetch registered machines from registry with timeout
      const machineIdsBytes: string[] = await withTimeout(
        registry.getMachineIds(),
        10000,
        "Machine IDs fetch timeout"
      ).catch(() => []);
      const machineNodesList: MapNode[] = [];

      for (let i = 0; i < machineIdsBytes.length; i++) {
        const idBytes = machineIdsBytes[i];
        let idStr = "";
        try {
          idStr = decodeBytes32String(idBytes);
        } catch {
          idStr = idBytes.slice(0, 8);
        }
        if (!idStr) continue;

        const info = await registry.getMachine(idBytes).catch(() => null);
        if (!info) continue;

        const mBalRaw = await provider.getBalance(info.wallet).catch(() => 0n);
        const mBal = formatEther(mBalRaw);

        machineNodesList.push({
          id: `machine-${idStr}`,
          label: idStr,
          subLabel: info.active ? "Active Machine" : "Inactive",
          kind: "machine",
          address: info.wallet,
          balance: mBal,
          x: 740,
          y: 140 + i * 160,
          details: {
            "Machine ID": idStr,
            "Operator Wallet": info.wallet,
            "Signer Address": info.signer,
            "Owner Address": info.owner,
            "Active Status": info.active,
            "Reputation Score": Number(info.reputation),
            "Jobs Completed": Number(info.jobsCompleted),
            "Jobs Failed": Number(info.jobsFailed),
            "Staked Collateral": `${formatEther(info.stake)} ${NATIVE_SYMBOL}`,
          },
        });
      }

      // Build Base Nodes (Customer always rendered; displays disconnected state if !clientAddress)
      const customerNode: MapNode = {
        id: "customer",
        label: clientAddress ? "Customer Wallet" : "Customer (Not Connected)",
        subLabel: clientAddress ? "Connected" : "Disconnected",
        kind: "customer",
        address: clientAddress || "0x0000000000000000000000000000000000000000",
        balance: clientBalance || "0.0000",
        x: 160,
        y: 260,
        details: {
          "Client Address": clientAddress || "Not connected",
          "Account Balance": `${clientBalance} ${NATIVE_SYMBOL}`,
          "Chain ID": cfg.chainId,
          "Network Name": cfg.network,
        },
      };

      const escrowNode: MapNode = {
        id: "escrow",
        label: "JobEscrow",
        subLabel: "Core Escrow Contract",
        kind: "contract",
        address: cfg.addresses.JobEscrow,
        balance: escrowBal,
        x: 450,
        y: 260,
        details: {
          "Contract Name": "JobEscrow.sol",
          "Contract Address": cfg.addresses.JobEscrow,
          "Vault Balance": `${escrowBal} ${NATIVE_SYMBOL}`,
          "Authorized Verifier": cfg.verifier,
        },
      };

      const registryNode: MapNode = {
        id: "registry",
        label: "MachineRegistry",
        subLabel: "Identity & Collateral",
        kind: "contract",
        address: cfg.addresses.MachineRegistry,
        balance: registryBal,
        x: 740,
        y: machineNodesList.length > 0 ? 140 + machineNodesList.length * 160 : 420,
        details: {
          "Contract Name": "MachineRegistry.sol",
          "Contract Address": cfg.addresses.MachineRegistry,
          "Total Staked Vault": `${registryBal} ${NATIVE_SYMBOL}`,
        },
      };

      const verifierNode: MapNode = {
        id: "verifier",
        label: "Protocol Verifier",
        subLabel: "Independent Attestation",
        kind: "verifier",
        address: cfg.verifier,
        balance: "0.0000",
        x: 450,
        y: 90,
        details: {
          "Verifier Address": cfg.verifier,
          "Attestation Schema": "EIP-712 MachinaPayAttestation",
        },
      };

      const allNodes = [customerNode, escrowNode, verifierNode, ...machineNodesList, registryNode];
      setNodes(allNodes);

      // Build Base Protocol Edges
      const baseEdges: MapEdge[] = [
        {
          id: "edge-customer-escrow",
          from: "customer",
          to: "escrow",
          label: "createJob",
          action: "createJob",
        },
        {
          id: "edge-verifier-escrow",
          from: "verifier",
          to: "escrow",
          label: "attestation",
          action: "submitAttestation",
        },
        {
          id: "edge-escrow-registry",
          from: "escrow",
          to: "registry",
          label: "recordJobResult",
          action: "recordJobResult",
        },
      ];

      // Add edges to each machine
      machineNodesList.forEach((m) => {
        baseEdges.push({
          id: `edge-escrow-${m.id}`,
          from: "escrow",
          to: m.id,
          label: "release payment",
          action: "release",
        });
        baseEdges.push({
          id: `edge-${m.id}-escrow`,
          from: m.id,
          to: "escrow",
          label: "submitProof",
          action: "submitProof",
        });
      });

      setEdges(baseEdges);

      // 2. QueryFilter for past events once (N recent blocks)
      const currentBlock = await withTimeout(provider.getBlockNumber(), 8000, "Get block timeout").catch(() => 0);
      const startBlock = Math.max(0, currentBlock - 500);

      const [
        createdLogs,
        acceptedLogs,
        proofLogs,
        verifiedLogs,
        releasedLogs,
        refundedLogs,
        regLogs,
      ] = await Promise.all([
        escrow.queryFilter(escrow.filters.JobCreated(), startBlock, currentBlock).catch(() => []),
        escrow.queryFilter(escrow.filters.JobAccepted(), startBlock, currentBlock).catch(() => []),
        escrow.queryFilter(escrow.filters.ProofSubmitted(), startBlock, currentBlock).catch(() => []),
        escrow.queryFilter(escrow.filters.VerificationSubmitted(), startBlock, currentBlock).catch(() => []),
        escrow.queryFilter(escrow.filters.PaymentReleased(), startBlock, currentBlock).catch(() => []),
        escrow.queryFilter(escrow.filters.JobRefunded(), startBlock, currentBlock).catch(() => []),
        registry.queryFilter(registry.filters.MachineRegistered(), startBlock, currentBlock).catch(() => []),
      ]);

      const parsedFeed: FeedEventItem[] = [];
      const allLogs = [
        ...createdLogs,
        ...acceptedLogs,
        ...proofLogs,
        ...verifiedLogs,
        ...releasedLogs,
        ...refundedLogs,
        ...regLogs,
      ].sort((a, b) => b.blockNumber - a.blockNumber);

      for (const log of allLogs) {
        const frag = (log as any).fragment;
        const name = frag?.name || "Event";
        const args = (log as any).args;
        let summary = name;
        let amt: string | undefined;

        if (name === "JobCreated") {
          amt = formatEther(args?.reward ?? 0);
          summary = `JobCreated: ${args?.description || "New job"} (${amt} ${NATIVE_SYMBOL})`;
        } else if (name === "JobAccepted") {
          summary = `JobAccepted: Machine accepted job ${args?.jobId?.slice(0, 8)}…`;
        } else if (name === "ProofSubmitted") {
          summary = `ProofSubmitted: Signed EIP-712 proof for ${args?.jobId?.slice(0, 8)}…`;
        } else if (name === "VerificationSubmitted") {
          summary = `VerificationSubmitted: Attestation ${args?.passed ? "PASSED" : "FAILED"}`;
        } else if (name === "PaymentReleased") {
          amt = formatEther(args?.reward ?? 0);
          summary = `PaymentReleased: ${amt} ${NATIVE_SYMBOL} released to machine`;
        } else if (name === "JobRefunded") {
          amt = formatEther(args?.reward ?? 0);
          summary = `JobRefunded: ${amt} ${NATIVE_SYMBOL} refunded to customer`;
        } else if (name === "MachineRegistered") {
          summary = `MachineRegistered: New machine registered with stake`;
        } else if (name === "MachineReputationUpdated") {
          summary = `MachineReputationUpdated: score=${args?.newReputation}`;
        }

        parsedFeed.push({
          id: `${log.transactionHash}-${log.index}`,
          name,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          timestamp: `Block #${log.blockNumber}`,
          amount: amt,
          summary,
          from: args?.customer || args?.machineWallet,
        });
      }

      setEventsFeed(parsedFeed.slice(0, 20));
    } catch (err: any) {
      console.error("Error loading Wallet Map data:", err);
      setRpcError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    loadChainData();
    return () => {
      mounted = false;
    };
  }, [clientAddress, clientBalance]);

  // 3. Event-Driven Real-time Updates (escrow.on / registry.on)
  useEffect(() => {
    let provider: any;
    let escrow: any;
    let registry: any;
    try {
      provider = getReadProvider();
      escrow = getEscrow(provider);
      registry = getRegistry(provider);
    } catch {
      return;
    }

    function triggerEdgeHighlight(edgeId: string, amount?: string, txHash?: string) {
      setActiveEdgeId(edgeId);
      setActiveEdgePacket({ edgeId, amount, txHash });
      setTimeout(() => {
        setActiveEdgeId(null);
        setActiveEdgePacket(null);
      }, 2200);
    }

    const onJobCreated = (jobId: string, customer: string, reward: bigint, metadataHash: string, deadline: bigint, description: string, event: any) => {
      const amt = formatEther(reward);
      const hash = event?.log?.transactionHash || "0x…";
      triggerEdgeHighlight("edge-customer-escrow", `${amt} ${NATIVE_SYMBOL}`, hash);
      setEventsFeed((prev) => [
        {
          id: `${hash}-${Date.now()}`,
          name: "JobCreated",
          txHash: hash,
          blockNumber: event?.log?.blockNumber || 0,
          timestamp: "Just now",
          amount: amt,
          summary: `JobCreated: ${description} (${amt} ${NATIVE_SYMBOL})`,
          from: customer,
        },
        ...prev,
      ]);
      loadChainData();
      onRefreshBalances();
    };

    const onJobAccepted = (jobId: string, machineId: string, machineWallet: string, event: any) => {
      const hash = event?.log?.transactionHash || "0x…";
      // Find machine edge
      const edge = edges.find((e) => e.action === "release") || edges[0];
      if (edge) triggerEdgeHighlight(edge.id, undefined, hash);
      setEventsFeed((prev) => [
        {
          id: `${hash}-${Date.now()}`,
          name: "JobAccepted",
          txHash: hash,
          blockNumber: event?.log?.blockNumber || 0,
          timestamp: "Just now",
          summary: `JobAccepted: Machine accepted job ${jobId.slice(0, 8)}…`,
          from: machineWallet,
        },
        ...prev,
      ]);
      loadChainData();
    };

    const onProofSubmitted = (jobId: string, machineId: string, result: number, proofHash: string, evidenceHash: string, event: any) => {
      const hash = event?.log?.transactionHash || "0x…";
      const edge = edges.find((e) => e.action === "submitProof") || edges[0];
      if (edge) triggerEdgeHighlight(edge.id, undefined, hash);
      setEventsFeed((prev) => [
        {
          id: `${hash}-${Date.now()}`,
          name: "ProofSubmitted",
          txHash: hash,
          blockNumber: event?.log?.blockNumber || 0,
          timestamp: "Just now",
          summary: `ProofSubmitted: EIP-712 proof for ${jobId.slice(0, 8)}…`,
        },
        ...prev,
      ]);
    };

    const onVerificationSubmitted = (jobId: string, passed: boolean, event: any) => {
      const hash = event?.log?.transactionHash || "0x…";
      triggerEdgeHighlight("edge-verifier-escrow", undefined, hash);
      setEventsFeed((prev) => [
        {
          id: `${hash}-${Date.now()}`,
          name: "VerificationSubmitted",
          txHash: hash,
          blockNumber: event?.log?.blockNumber || 0,
          timestamp: "Just now",
          summary: `VerificationSubmitted: Attestation ${passed ? "PASSED" : "FAILED"}`,
        },
        ...prev,
      ]);
    };

    const onPaymentReleased = (jobId: string, machineWallet: string, reward: bigint, event: any) => {
      const amt = formatEther(reward);
      const hash = event?.log?.transactionHash || "0x…";
      const edge = edges.find((e) => e.action === "release") || edges[0];
      if (edge) triggerEdgeHighlight(edge.id, `${amt} ${NATIVE_SYMBOL}`, hash);
      setEventsFeed((prev) => [
        {
          id: `${hash}-${Date.now()}`,
          name: "PaymentReleased",
          txHash: hash,
          blockNumber: event?.log?.blockNumber || 0,
          timestamp: "Just now",
          amount: amt,
          summary: `PaymentReleased: ${amt} ${NATIVE_SYMBOL} released to machine`,
          to: machineWallet,
        },
        ...prev,
      ]);
      loadChainData();
      onRefreshBalances();
    };

    const onJobRefunded = (jobId: string, customer: string, reward: bigint, reason: number, event: any) => {
      const amt = formatEther(reward);
      const hash = event?.log?.transactionHash || "0x…";
      triggerEdgeHighlight("edge-customer-escrow", `${amt} ${NATIVE_SYMBOL} REFUND`, hash);
      setEventsFeed((prev) => [
        {
          id: `${hash}-${Date.now()}`,
          name: "JobRefunded",
          txHash: hash,
          blockNumber: event?.log?.blockNumber || 0,
          timestamp: "Just now",
          amount: amt,
          summary: `JobRefunded: ${amt} ${NATIVE_SYMBOL} refunded to customer`,
          to: customer,
        },
        ...prev,
      ]);
      loadChainData();
      onRefreshBalances();
    };

    const onMachineReputationUpdated = (machineId: string, oldRep: bigint, newRep: bigint, event: any) => {
      const hash = event?.log?.transactionHash || "0x…";
      triggerEdgeHighlight("edge-escrow-registry", `Rep ${oldRep}→${newRep}`, hash);
      loadChainData();
    };

    escrow.on("JobCreated", onJobCreated);
    escrow.on("JobAccepted", onJobAccepted);
    escrow.on("ProofSubmitted", onProofSubmitted);
    escrow.on("VerificationSubmitted", onVerificationSubmitted);
    escrow.on("PaymentReleased", onPaymentReleased);
    escrow.on("JobRefunded", onJobRefunded);
    registry.on("MachineReputationUpdated", onMachineReputationUpdated);

    return () => {
      escrow.off("JobCreated", onJobCreated);
      escrow.off("JobAccepted", onJobAccepted);
      escrow.off("ProofSubmitted", onProofSubmitted);
      escrow.off("VerificationSubmitted", onVerificationSubmitted);
      escrow.off("PaymentReleased", onPaymentReleased);
      escrow.off("JobRefunded", onJobRefunded);
      registry.off("MachineReputationUpdated", onMachineReputationUpdated);
    };
  }, [edges]);

  // 4. Create Job Form Submission (Right Panel)
  async function handleCreateJob(e: React.FormEvent) {
    e.preventDefault();
    if (!signer) {
      setFormError("Connect your wallet first.");
      return;
    }
    setFormSubmitting(true);
    setFormError(null);
    setFormTxStatus("Waiting for signature...");

    // Set Customer->Escrow edge pending
    setEdges((prev) =>
      prev.map((ed) =>
        ed.id === "edge-customer-escrow" ? { ...ed, isPending: true, isError: false } : ed
      )
    );

    let escrow: any;
    try {
      escrow = getEscrow(signer);
      const jobId = keccak256(toUtf8Bytes(`job-${Date.now()}`));
      const durationSeconds = Math.max(60, Number(formDurationMinutes) * 60);

      // Register metadata off-chain to Backend
      let metadataHash = keccak256(toUtf8Bytes(formDescription));
      try {
        const metaRes = await fetch(`${MEMBER3_API_URL}/api/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskType: "PACKAGE_TRANSPORT",
            description: formDescription,
          }),
        });
        if (metaRes.ok) {
          const mJson = await metaRes.json();
          if (mJson.metadataHash) metadataHash = mJson.metadataHash;
        }
      } catch {
        // Fallback
      }

      setFormTxStatus("Broadcasting transaction to blockchain…");
      const tx = await escrow.createJob(jobId, metadataHash, durationSeconds, formDescription, {
        value: parseEther(formReward),
      });

      setFormTxStatus(`Mining transaction (${tx.hash.slice(0, 10)}…)`);
      const rc = await tx.wait();

      setFormTxStatus(`Success! Job funded in block #${rc.blockNumber}`);
      setEdges((prev) =>
        prev.map((ed) =>
          ed.id === "edge-customer-escrow" ? { ...ed, isPending: false, isError: false } : ed
        )
      );

      // Trigger instant pulse
      setActiveEdgeId("edge-customer-escrow");
      setActiveEdgePacket({
        edgeId: "edge-customer-escrow",
        amount: `${formReward} ${NATIVE_SYMBOL}`,
        txHash: tx.hash,
      });
      setTimeout(() => {
        setActiveEdgeId(null);
        setActiveEdgePacket(null);
      }, 2200);

      loadChainData();
      onRefreshBalances();
    } catch (err: any) {
      console.error("JobEscrow.createJob error:", err);
      const decoded = decodeContractError(err, escrow);
      setFormError(decoded);
      setFormTxStatus(null);
      // Turn edge red on error
      setEdges((prev) =>
        prev.map((ed) =>
          ed.id === "edge-customer-escrow"
            ? { ...ed, isPending: false, isError: true, errorMessage: decoded }
            : ed
        )
      );
    } finally {
      setFormSubmitting(false);
    }
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  const filteredFeed = filterMyEvents && clientAddress
    ? eventsFeed.filter(
        (ev) =>
          ev.from?.toLowerCase() === clientAddress.toLowerCase() ||
          ev.to?.toLowerCase() === clientAddress.toLowerCase()
      )
    : eventsFeed;

  return (
    <div className="space-y-6 font-sans">
      {/* 1. Header Banner */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">Wallet Map</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Live map of customer, machines and escrow flows.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-mono">
            {nodes.length} nodes / {edges.length} edges
          </span>
          <button
            onClick={() => setViewBox({ x: 0, y: 0, width: 960, height: 560 })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Fit</span>
          </button>
          <button
            onClick={() => {
              setActiveEdgeId(null);
              setActiveEdgePacket(null);
              setSelectedNodeId("customer");
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors"
          >
            <span>Clear</span>
          </button>
        </div>
      </div>

      {rpcError && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span>RPC Connection Error: {rpcError}</span>
          </div>
          <button
            onClick={loadChainData}
            className="underline font-semibold hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. Main Canvas + Right Inspector Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Graph Canvas (Dark Canvas with white/neutral wrapper) */}
        <div className="lg:col-span-8 bg-[#0B0B0E] border border-gray-800 rounded-xl relative overflow-hidden flex flex-col justify-between shadow-sm min-h-[560px]">
          {/* Legend: Customer, Machine, Contract, Verifier */}
          <div className="p-3 border-b border-gray-800 bg-[#070709] flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono select-none">
            <div className="flex items-center gap-4">
              <span className="text-gray-400">Legend:</span>
              <span className="flex items-center gap-1.5 text-gray-300">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Customer
              </span>
              <span className="flex items-center gap-1.5 text-gray-300">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Machine
              </span>
              <span className="flex items-center gap-1.5 text-gray-300">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Contract
              </span>
            </div>

            {activeEdgePacket && (
              <div className="text-[11px] text-cyan-400 font-mono animate-pulse">
                EVENT: {activeEdgePacket.amount || "Execution"} ({activeEdgePacket.txHash?.slice(0, 10)}…)
              </div>
            )}
          </div>

          {/* SVG Canvas */}
          <div className="flex-1 relative flex items-center justify-center p-4">
            {loading && nodes.length === 0 ? (
              <div className="text-center space-y-2 py-24 text-gray-500 font-mono text-xs">
                <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Loading real on-chain topology from {cfg.network}…</p>
              </div>
            ) : rpcError && nodes.length === 0 ? (
              <div className="text-center space-y-4 py-16 text-gray-400 font-mono text-xs max-w-md mx-auto">
                <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Can't reach {cfg.network} RPC</p>
                  <p className="text-gray-400 mt-1">
                    Unable to load topology. Verify network connection or ensure contracts are deployed (run npm run deploy:mst).
                  </p>
                </div>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => loadChainData()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Retry
                  </button>
                  <button
                    onClick={() => setShowErrorDetails(!showErrorDetails)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs transition cursor-pointer"
                  >
                    Technical Details {showErrorDetails ? "▲" : "▼"}
                  </button>
                </div>
                {showErrorDetails && (
                  <div className="text-left bg-gray-950 p-3 rounded border border-gray-800 text-[11px] text-gray-400 space-y-1">
                    <div><span className="text-gray-500">RPC URL:</span> {cfg.rpcUrl}</div>
                    <div><span className="text-gray-500">Chain ID:</span> {cfg.chainId}</div>
                    <div><span className="text-gray-500">JobEscrow:</span> {cfg.addresses.JobEscrow}</div>
                    <div><span className="text-gray-500">MachineRegistry:</span> {cfg.addresses.MachineRegistry}</div>
                    <div className="text-red-400 break-all"><span className="text-gray-500">Error:</span> {rpcError}</div>
                  </div>
                )}
              </div>
            ) : (
              <svg
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
                className="w-full h-full select-none"
              >
                <defs>
                  {/* Arrowhead marker */}
                  <marker
                    id="map-arrow"
                    viewBox="0 0 10 10"
                    refX="26"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#4B5563" />
                  </marker>
                  <marker
                    id="map-arrow-active"
                    viewBox="0 0 10 10"
                    refX="26"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#22D3EE" />
                  </marker>
                  <marker
                    id="map-arrow-error"
                    viewBox="0 0 10 10"
                    refX="26"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#EF4444" />
                  </marker>
                </defs>

                {/* 1. EDGES */}
                {edges.map((edge) => {
                  const fromNode = nodes.find((n) => n.id === edge.from);
                  const toNode = nodes.find((n) => n.id === edge.to);
                  if (!fromNode || !toNode) return null;

                  const isActive = activeEdgeId === edge.id;
                  const isPending = Boolean(edge.isPending);
                  const isError = Boolean(edge.isError);

                  const strokeColor = isError
                    ? "#EF4444"
                    : isActive
                    ? "#22D3EE"
                    : isPending
                    ? "#F59E0B"
                    : "#374151";

                  const strokeWidth = isActive || isPending ? 2.5 : 1.5;
                  const strokeDash = isPending ? "6,4" : "none";
                  const markerId = isError
                    ? "url(#map-arrow-error)"
                    : isActive
                    ? "url(#map-arrow-active)"
                    : "url(#map-arrow)";

                  const midX = (fromNode.x + toNode.x) / 2;
                  const midY = (fromNode.y + toNode.y) / 2 - 8;

                  return (
                    <g key={edge.id}>
                      <line
                        x1={fromNode.x}
                        y1={fromNode.y}
                        x2={toNode.x}
                        y2={toNode.y}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDash}
                        markerEnd={markerId}
                        className="transition-colors duration-300"
                      />

                      {/* Edge Label */}
                      <text
                        x={midX}
                        y={midY}
                        fill={isActive ? "#22D3EE" : isError ? "#EF4444" : "#9CA3AF"}
                        fontSize="10"
                        fontFamily="monospace"
                        textAnchor="middle"
                        className="select-none pointer-events-none"
                      >
                        {edge.label}
                      </text>

                      {/* Single animated dot on real event */}
                      {isActive && (
                        <circle r="4" fill="#22D3EE">
                          <animateMotion
                            path={`M ${fromNode.x} ${fromNode.y} L ${toNode.x} ${toNode.y}`}
                            dur="1.2s"
                            repeatCount="1"
                            fill="freeze"
                          />
                        </circle>
                      )}
                    </g>
                  );
                })}

                {/* 2. NODES */}
                {nodes.map((node) => {
                  const isSelected = selectedNodeId === node.id;
                  const color =
                    node.kind === "customer"
                      ? "#22D3EE"
                      : node.kind === "machine"
                      ? "#10B981"
                      : node.kind === "verifier"
                      ? "#F59E0B"
                      : "#8B5CF6";

                  return (
                    <g
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className="cursor-pointer group"
                    >
                      {/* Selection Ring */}
                      {isSelected && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r="28"
                          fill="none"
                          stroke={color}
                          strokeWidth="2"
                          strokeDasharray="4,2"
                          className="opacity-70 animate-spin-slow"
                        />
                      )}

                      {/* Node Circle */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="20"
                        fill="#141419"
                        stroke={color}
                        strokeWidth="2"
                        className="transition-transform group-hover:scale-110"
                      />

                      {/* Center Dot */}
                      <circle cx={node.x} cy={node.y} r="5" fill={color} />

                      {/* Label sitting neatly below circle without overlapping */}
                      <text
                        x={node.x}
                        y={node.y + 36}
                        fill="#FFFFFF"
                        fontSize="11"
                        fontWeight="bold"
                        fontFamily="monospace"
                        textAnchor="middle"
                      >
                        {node.label}
                      </text>

                      {/* Sub-label */}
                      {node.subLabel && (
                        <text
                          x={node.x}
                          y={node.y + 48}
                          fill="#9CA3AF"
                          fontSize="9"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          {node.subLabel}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>

        {/* Right: Inspector + Create Job + Feed */}
        <div className="lg:col-span-4 space-y-6">
          {/* Node Inspector Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor:
                      selectedNode?.kind === "customer"
                        ? "#22D3EE"
                        : selectedNode?.kind === "machine"
                        ? "#10B981"
                        : selectedNode?.kind === "verifier"
                        ? "#F59E0B"
                        : "#8B5CF6",
                  }}
                />
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 font-mono">
                  {selectedNode?.label || "Node Details"}
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                {selectedNode?.kind.toUpperCase()}
              </span>
            </div>

            {selectedNode && (
              <div className="space-y-3 font-mono text-xs">
                <div>
                  <span className="text-gray-500 text-[10px] uppercase">Address</span>
                  <div className="flex items-center justify-between gap-2 mt-0.5 p-2 rounded bg-gray-50 border border-gray-200 text-gray-900">
                    <span className="truncate">
                      {selectedNode.address.slice(0, 10)}…{selectedNode.address.slice(-8)}
                    </span>
                    <button
                      onClick={() => copyText("addr", selectedNode.address)}
                      className="text-gray-500 hover:text-gray-900"
                    >
                      {copiedKey === "addr" ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-gray-500 text-[10px] uppercase">Balance</span>
                  <div className="text-sm font-bold text-gray-900 mt-0.5">
                    {selectedNode.balance} {NATIVE_SYMBOL}
                  </div>
                </div>

                {selectedNode.details && (
                  <div className="p-2.5 rounded bg-gray-50 border border-gray-200 text-[11px] space-y-1.5 text-gray-700">
                    {Object.entries(selectedNode.details).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <span className="text-gray-500">{k}:</span>
                        <span className="font-semibold text-gray-900 truncate max-w-[160px]">
                          {String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Create Job Form (Replaces Direct Transfer Form) */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 shadow-xs">
            <div className="border-b border-gray-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 font-mono">
                Create Escrow Job
              </h3>
              <p className="text-[11px] text-gray-500">
                Deposit funds directly into JobEscrow contract
              </p>
            </div>

            <form onSubmit={handleCreateJob} className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-gray-500 text-[10px] uppercase">Description</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  disabled={formSubmitting}
                  className="w-full mt-1 px-3 py-2 rounded border border-gray-200 bg-gray-50 text-gray-900 outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-500 text-[10px] uppercase">
                    Reward ({NATIVE_SYMBOL})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formReward}
                    onChange={(e) => setFormReward(e.target.value)}
                    disabled={formSubmitting}
                    className="w-full mt-1 px-3 py-2 rounded border border-gray-200 bg-gray-50 text-gray-900 outline-none focus:border-blue-500 font-bold"
                  />
                </div>
                <div>
                  <label className="text-gray-500 text-[10px] uppercase">Expiry (Mins)</label>
                  <input
                    type="number"
                    value={formDurationMinutes}
                    onChange={(e) => setFormDurationMinutes(e.target.value)}
                    disabled={formSubmitting}
                    className="w-full mt-1 px-3 py-2 rounded border border-gray-200 bg-gray-50 text-gray-900 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {formTxStatus && (
                <div className="p-2 rounded bg-blue-50 border border-blue-200 text-blue-800 text-[11px]">
                  {formTxStatus}
                </div>
              )}

              {formError && (
                <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-[11px]">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={formSubmitting || !signer}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs transition-colors shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {formSubmitting
                    ? "Locking Funds…"
                    : `Lock ${formReward} ${NATIVE_SYMBOL} & Create Job`}
                </span>
              </button>
            </form>
          </div>

          {/* Real Contract Event Feed */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 font-mono">
                Contract Activity Feed
              </h3>
              <label className="flex items-center gap-1.5 text-[10px] text-gray-500 font-mono cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterMyEvents}
                  onChange={(e) => setFilterMyEvents(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600"
                />
                <span>My Events Only</span>
              </label>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto font-mono text-xs">
              {filteredFeed.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs">
                  No activity yet.
                </div>
              ) : (
                filteredFeed.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-2.5 rounded bg-gray-50 border border-gray-200 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900">{ev.name}</span>
                      <span className="text-[10px] text-gray-400">{ev.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-gray-600 truncate">{ev.summary}</p>
                    <div className="flex justify-between items-center text-[10px] text-gray-400 pt-1">
                      <span>Tx: {ev.txHash.slice(0, 10)}…</span>
                      {ev.amount && (
                        <span className="font-semibold text-emerald-600">
                          {ev.amount} {NATIVE_SYMBOL}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
