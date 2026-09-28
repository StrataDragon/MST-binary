import React, { useState, useEffect, useRef } from "react";
import { formatEther, parseEther, decodeBytes32String, keccak256, toUtf8Bytes } from "ethers";
import {
  Wallet,
  Cpu,
  Lock,
  Layers,
  Send,
  AlertTriangle,
  RotateCcw,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  Trash2,
} from "lucide-react";
import { cfg, NATIVE_SYMBOL, MEMBER3_API_URL, SIMULATOR_URL, DEFAULT_JOB_CONFIG } from "../lib/config";
import { getReadProvider, getEscrow, getRegistry, decodeContractError } from "../lib/wallet";
import {
  MapNode,
  MapEdge,
  ViewportTransform,
  buildDefaultTopology,
  computeFitTransform,
  computeEdgeGeometry,
  clearDynamicActivity,
  MachineInfoInput,
} from "../lib/topology";

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

type SimulatorMachineStatus = {
  machineId: string;
  connected: boolean;
  robotState: string;
  activeJobId: string | null;
  queueLength: number;
  updatedAt: string;
};

function simulatorStateLabel(status: SimulatorMachineStatus): string {
  if (!status.connected) return "3D simulator offline";
  return status.robotState === "IDLE"
    ? "3D simulator online - idle"
    : `3D simulator - ${status.robotState.replace(/_/g, " ").toLowerCase()}`;
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
  const [simulatorMachines, setSimulatorMachines] = useState<SimulatorMachineStatus[]>([]);
  const [animationsPaused, setAnimationsPaused] = useState<boolean>(false);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Viewport & Pan / Zoom State
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 900, height: 560 });
  const [viewport, setViewport] = useState<ViewportTransform>({ scale: 1, translateX: 0, translateY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const hasDraggedRef = useRef(false);
  const hasUserAdjustedRef = useRef(false);

  // Loading & error states
  const [loading, setLoading] = useState<boolean>(true);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState<boolean>(false);

  // Create Job Form inside Right Panel
  const [formDescription, setFormDescription] = useState("Autonomous transport package delivery");
  const [formReward, setFormReward] = useState(DEFAULT_JOB_CONFIG.reward);
  const [formDurationMinutes, setFormDurationMinutes] = useState("60");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formTxStatus, setFormTxStatus] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [suggestedReward, setSuggestedReward] = useState<string | null>(null);

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
      await withTimeout(provider.getBlockNumber(), 10000, "Can't reach RPC");
      const registry = getRegistry(provider);
      const escrow = getEscrow(provider);

      const [escrowBalRaw, registryBalRaw] = await Promise.all([
        withTimeout(provider.getBalance(cfg.addresses.JobEscrow), 10000, "Escrow balance timeout").catch(() => 0n),
        withTimeout(provider.getBalance(cfg.addresses.MachineRegistry), 10000, "Registry balance timeout").catch(() => 0n),
      ]);
      const escrowBal = formatEther(escrowBalRaw);
      const registryBal = formatEther(registryBalRaw);

      const machineIdsBytes: string[] = await withTimeout(
        registry.getMachineIds(),
        10000,
        "Machine IDs fetch timeout"
      ).catch(() => []);

      const machineDataList: MachineInfoInput[] = [];

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

        machineDataList.push({
          idStr,
          wallet: info.wallet,
          signer: info.signer,
          owner: info.owner,
          active: info.active,
          reputation: Number(info.reputation),
          stake: formatEther(info.stake),
          balance: mBal,
        });
      }

      // Build canonical topology with deterministic layered layout
      const topology = buildDefaultTopology(clientAddress, clientBalance, machineDataList, {
        escrowAddress: cfg.addresses.JobEscrow,
        registryAddress: cfg.addresses.MachineRegistry,
        verifierAddress: cfg.verifier,
        network: cfg.network,
        nativeToken: NATIVE_SYMBOL,
      });

      // Update escrow and registry balances from chain
      const updatedNodes = topology.nodes.map((n) => {
        if (n.id === "escrow") {
          return {
            ...n,
            balance: escrowBal,
            details: {
              ...n.details,
              "Vault Balance": `${escrowBal} ${NATIVE_SYMBOL}`,
            },
          };
        }
        if (n.id === "registry") {
          return {
            ...n,
            balance: registryBal,
            details: {
              ...n.details,
              "Total Staked Vault": `${registryBal} ${NATIVE_SYMBOL}`,
            },
          };
        }
        return n;
      });

      setNodes(updatedNodes);
      setEdges(topology.edges);

      // Auto-fit if user hasn't manually adjusted
      if (!hasUserAdjustedRef.current && containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        if (width > 0 && height > 0) {
          setViewport(computeFitTransform(updatedNodes, width, height));
        }
      }

      // Past events from chain
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
          summary = `JobAccepted: Machine accepted job ${args?.jobId?.slice(0, 8)}...`;
        } else if (name === "ProofSubmitted") {
          summary = `ProofSubmitted: Signed EIP-712 proof for ${args?.jobId?.slice(0, 8)}...`;
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
    loadChainData();
  }, [clientAddress, clientBalance]);

  // Container resize observer for responsive layout and auto-fit
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
          if (!hasUserAdjustedRef.current && nodes.length > 0) {
            setViewport(computeFitTransform(nodes, width, height));
          }
        }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [nodes]);

  // Keep the customer UI visibly coupled to the live 3D simulator
  useEffect(() => {
    let disposed = false;

    async function refreshSimulatorStatus() {
      try {
        const response = await fetch(`${MEMBER3_API_URL}/api/simulator/status`);
        if (!response.ok) {
          if (disposed) return;
          setNodes((previous) =>
            previous.map((node) => {
              if (node.kind !== "machine") return node;
              return {
                ...node,
                subLabel: "Backend unreachable",
                details: {
                  ...node.details,
                  "3D Simulator": "Backend unreachable",
                },
              };
            })
          );
          return;
        }
        const payload = (await response.json()) as { machines?: SimulatorMachineStatus[] };
        const statuses = payload.machines || [];
        if (disposed) return;

        setSimulatorMachines(statuses);
        setNodes((previous) =>
          previous.map((node) => {
            if (node.kind !== "machine") return node;
            const status = statuses.find((item) => `Machine ${item.machineId}` === node.label || item.machineId === node.label);
            if (!status) return node;
            return {
              ...node,
              subLabel: simulatorStateLabel(status),
              details: {
                ...node.details,
                "3D Simulator": status.connected ? status.robotState : "OFFLINE",
                "Queued Jobs": status.queueLength,
                "Active Simulator Job": status.activeJobId || "None",
              },
            };
          })
        );
      } catch {
        if (disposed) return;
        setNodes((previous) =>
          previous.map((node) => {
            if (node.kind !== "machine") return node;
            return {
              ...node,
              subLabel: "Backend unreachable",
              details: {
                ...node.details,
                "3D Simulator": "Backend unreachable",
              },
            };
          })
        );
      }
    }

    refreshSimulatorStatus();
    const interval = window.setInterval(refreshSimulatorStatus, 1500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  // Event-Driven Real-time Updates (escrow.on / registry.on)
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
      }, 2400);
    }

    const onJobCreated = (jobId: string, customer: string, reward: bigint, metadataHash: string, deadline: bigint, description: string, event: any) => {
      const amt = formatEther(reward);
      const hash = event?.log?.transactionHash || "0x...";
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
      const hash = event?.log?.transactionHash || "0x...";
      const edge = edges.find((e) => e.to === "escrow" && e.from.startsWith("machine")) || edges[0];
      if (edge) triggerEdgeHighlight(edge.id, undefined, hash);
      setEventsFeed((prev) => [
        {
          id: `${hash}-${Date.now()}`,
          name: "JobAccepted",
          txHash: hash,
          blockNumber: event?.log?.blockNumber || 0,
          timestamp: "Just now",
          summary: `JobAccepted: Machine accepted job ${jobId.slice(0, 8)}...`,
          from: machineWallet,
        },
        ...prev,
      ]);
      loadChainData();
    };

    const onProofSubmitted = (jobId: string, machineId: string, proofHash: string, event: any) => {
      const hash = event?.log?.transactionHash || "0x...";
      const edge = edges.find((e) => e.to === "escrow" && e.from.startsWith("machine")) || edges[0];
      if (edge) triggerEdgeHighlight(edge.id, "Proof", hash);
      setEventsFeed((prev) => [
        {
          id: `${hash}-${Date.now()}`,
          name: "ProofSubmitted",
          txHash: hash,
          blockNumber: event?.log?.blockNumber || 0,
          timestamp: "Just now",
          summary: `ProofSubmitted: Signed EIP-712 proof for ${jobId.slice(0, 8)}...`,
        },
        ...prev,
      ]);
      loadChainData();
    };

    const onVerificationSubmitted = (jobId: string, verifier: string, passed: boolean, event: any) => {
      const hash = event?.log?.transactionHash || "0x...";
      triggerEdgeHighlight("edge-verifier-escrow", passed ? "PASSED" : "FAILED", hash);
      setEventsFeed((prev) => [
        {
          id: `${hash}-${Date.now()}`,
          name: "VerificationSubmitted",
          txHash: hash,
          blockNumber: event?.log?.blockNumber || 0,
          timestamp: "Just now",
          summary: `VerificationSubmitted: Attestation ${passed ? "PASSED" : "FAILED"}`,
          from: verifier,
        },
        ...prev,
      ]);
      loadChainData();
    };

    const onPaymentReleased = (jobId: string, machineWallet: string, reward: bigint, event: any) => {
      const amt = formatEther(reward);
      const hash = event?.log?.transactionHash || "0x...";
      const edge = edges.find((e) => e.from === "escrow" && e.to.startsWith("machine")) || edges[0];
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
      const hash = event?.log?.transactionHash || "0x...";
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
      const hash = event?.log?.transactionHash || "0x...";
      triggerEdgeHighlight("edge-escrow-registry", `Rep ${oldRep} -> ${newRep}`, hash);
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

  // Pan / Zoom handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    hasDraggedRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: viewport.translateX,
      ty: viewport.translateY,
    };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      hasDraggedRef.current = true;
      hasUserAdjustedRef.current = true;
      setViewport({
        scale: viewport.scale,
        translateX: dragStartRef.current.tx + dx,
        translateY: dragStartRef.current.ty + dy,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    hasUserAdjustedRef.current = true;
    const factor = e.deltaY < 0 ? 1.09 : 0.91;
    setViewport((prev) => {
      const newScale = Math.min(2.25, Math.max(0.65, prev.scale * factor));
      const rect = containerRef.current?.getBoundingClientRect();
      const mouseX = rect ? e.clientX - rect.left : containerSize.width / 2;
      const mouseY = rect ? e.clientY - rect.top : containerSize.height / 2;
      return {
        scale: newScale,
        translateX: Math.round(mouseX - (mouseX - prev.translateX) * (newScale / prev.scale)),
        translateY: Math.round(mouseY - (mouseY - prev.translateY) * (newScale / prev.scale)),
      };
    });
  };

  const handleZoomIn = () => {
    hasUserAdjustedRef.current = true;
    setViewport((prev) => {
      const newScale = Math.min(2.25, prev.scale * 1.2);
      const cx = containerSize.width / 2;
      const cy = containerSize.height / 2;
      return {
        scale: newScale,
        translateX: Math.round(cx - (cx - prev.translateX) * (newScale / prev.scale)),
        translateY: Math.round(cy - (cy - prev.translateY) * (newScale / prev.scale)),
      };
    });
  };

  const handleZoomOut = () => {
    hasUserAdjustedRef.current = true;
    setViewport((prev) => {
      const newScale = Math.max(0.65, prev.scale / 1.2);
      const cx = containerSize.width / 2;
      const cy = containerSize.height / 2;
      return {
        scale: newScale,
        translateX: Math.round(cx - (cx - prev.translateX) * (newScale / prev.scale)),
        translateY: Math.round(cy - (cy - prev.translateY) * (newScale / prev.scale)),
      };
    });
  };

  const handleFitGraph = () => {
    hasUserAdjustedRef.current = false;
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      setViewport(computeFitTransform(nodes, width || containerSize.width, height || containerSize.height));
    } else {
      setViewport(computeFitTransform(nodes, containerSize.width, containerSize.height));
    }
  };

  const handleClearActivity = () => {
    const result = clearDynamicActivity(nodes, edges);
    setNodes(result.nodes);
    setEdges(result.edges);
    setActiveEdgeId(null);
    setActiveEdgePacket(null);
    setEventsFeed([]);
    if (!result.nodes.some((n) => n.id === selectedNodeId)) {
      setSelectedNodeId("customer");
    }
  };

  const handleNodeClick = (nodeId: string) => {
    if (hasDraggedRef.current) return;
    setSelectedNodeId(nodeId);
  };

  // Create Job Form Submission
  async function handleCreateJob(e: React.FormEvent) {
    e.preventDefault();
    if (!signer) {
      setFormError("Connect your wallet first.");
      return;
    }
    setFormSubmitting(true);
    setFormError(null);
    setSuggestedReward(null);
    setFormTxStatus("Waiting for signature...");

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

      let metadataHash: string;
      try {
        const metaRes = await fetch(`${MEMBER3_API_URL}/api/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskType: "PACKAGE_TRANSPORT",
            description: formDescription,
          }),
        });
        if (!metaRes.ok) {
          throw new Error(`Backend metadata registration failed with HTTP ${metaRes.status}`);
        }
        const mJson = await metaRes.json();
        if (!mJson.metadataHash) {
          throw new Error("Backend did not return a valid metadataHash");
        }
        metadataHash = mJson.metadataHash;
      } catch (e: any) {
        throw new Error(`Cannot broadcast job: Backend metadata service unreachable (${e.message}). Ensure Backend-service is active.`);
      }

      // Pre-flight balance & gas check before triggering wallet prompt
      const userAddr = await signer.getAddress();
      const userBalance: bigint = await signer.provider.getBalance(userAddr);
      const feeData = await signer.provider.getFeeData();
      const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || 1000000000n;
      let estGas = 200000n;
      try {
        estGas = await escrow.createJob.estimateGas(jobId, metadataHash, durationSeconds, formDescription, {
          value: parseEther(formReward || "0"),
        });
      } catch {
        estGas = 250000n;
      }
      const estGasCost = (estGas * gasPrice * 12n) / 10n; // 20% safety margin
      const rewardWei = parseEther(formReward || "0");
      const totalNeeded = rewardWei + estGasCost;

      if (userBalance < totalNeeded) {
        const maxSafeWei = userBalance > estGasCost ? userBalance - estGasCost : 0n;
        const maxSafe = formatEther(maxSafeWei);
        setSuggestedReward(maxSafe);
        throw new Error(
          `Need ${formatEther(totalNeeded)} ${NATIVE_SYMBOL} (reward ${formReward} + gas ~${formatEther(estGasCost)}), but wallet has ${formatEther(userBalance)} ${NATIVE_SYMBOL}. Max safe reward is ${Number(maxSafe).toFixed(4)} ${NATIVE_SYMBOL}.`
        );
      }

      setFormTxStatus("Broadcasting transaction to blockchain...");
      const tx = await escrow.createJob(jobId, metadataHash, durationSeconds, formDescription, {
        value: parseEther(formReward),
      });

      setFormTxStatus(`Mining transaction (${tx.hash.slice(0, 10)}...)`);
      const rc = await tx.wait();

      setFormTxStatus(`Success! Job funded in block #${rc.blockNumber}`);
      setEdges((prev) =>
        prev.map((ed) =>
          ed.id === "edge-customer-escrow" ? { ...ed, isPending: false, isError: false } : ed
        )
      );

      setActiveEdgeId("edge-customer-escrow");
      setActiveEdgePacket({
        edgeId: "edge-customer-escrow",
        amount: `${formReward} ${NATIVE_SYMBOL}`,
        txHash: tx.hash,
      });
      setTimeout(() => {
        setActiveEdgeId(null);
        setActiveEdgePacket(null);
      }, 2400);

      loadChainData();
      onRefreshBalances();
    } catch (err: any) {
      console.error("JobEscrow.createJob error:", err);
      const decoded = decodeContractError(err, escrow);
      setFormError(decoded);
      setFormTxStatus(null);
      setEdges((prev) =>
        prev.map((ed) =>
          ed.id === "edge-customer-escrow"
            ? { ...ed, isPending: false, isError: true }
            : ed
        )
      );
    } finally {
      setFormSubmitting(false);
    }
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];
  const selectedSimulatorStatus =
    selectedNode?.kind === "machine"
      ? simulatorMachines.find((status) => `Machine ${status.machineId}` === selectedNode.label || status.machineId === selectedNode.label)
      : undefined;

  const filteredFeed =
    filterMyEvents && clientAddress
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
            Interactive topology of customer, escrow contracts, verifiers, and machine operators.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-gray-500 font-mono bg-gray-50 px-2.5 py-1 rounded border border-gray-200">
            {nodes.length} nodes / {edges.length} flows
          </span>
          <button
            onClick={handleFitGraph}
            title="Fit graph to view"
            aria-label="Fit graph"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors shadow-2xs cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Fit graph</span>
          </button>
          <button
            onClick={handleClearActivity}
            title="Clear dynamic activity and reset highlights"
            aria-label="Clear activity"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 transition-colors shadow-2xs cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-gray-500" />
            <span>Clear activity</span>
          </button>
        </div>
      </div>

      {rpcError && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span>RPC Connection Error: {rpcError}</span>
          </div>
          <button onClick={loadChainData} className="underline font-semibold hover:text-red-900 cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* 2. Main Canvas + Right Inspector Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Graph Canvas */}
        <div className="lg:col-span-8 bg-[#0B0B0E] border border-gray-800 rounded-xl relative overflow-hidden flex flex-col justify-between shadow-sm min-h-[580px]">
          {/* Legend and Ambient State Banner */}
          <div className="p-3 border-b border-gray-800 bg-[#070709] flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono select-none">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-gray-500">Legend:</span>
              <span className="flex items-center gap-1.5 text-gray-300">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Customer (EOA)
              </span>
              <span className="flex items-center gap-1.5 text-gray-300">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Machine Operator
              </span>
              <span className="flex items-center gap-1.5 text-gray-300">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Verifier Service
              </span>
              <span className="flex items-center gap-1.5 text-gray-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-purple-500" /> Smart Contract
              </span>
            </div>

            <div className="flex items-center gap-2">
              {clientAddress ? (
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                  Wallet connected
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-blue-950/60 text-blue-300 border border-blue-800/40">
                  Wallet disconnected - showing example topology
                </span>
              )}
            </div>
          </div>

          {/* SVG Canvas Area */}
          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            className={`flex-1 relative flex items-center justify-center p-0 overflow-hidden ${
              isDragging ? "cursor-grabbing" : "cursor-grab"
            }`}
            style={{ touchAction: "none" }}
          >
            {/* Viewport Control Overlay (Zoom In, Zoom Out, Fit, Pause/Play) */}
            <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 bg-[#141419]/90 border border-gray-800 rounded-lg p-1.5 shadow-lg backdrop-blur-xs select-none">
              <button
                onClick={handleZoomIn}
                title="Zoom In"
                aria-label="Zoom In"
                className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleZoomOut}
                title="Zoom Out"
                aria-label="Zoom Out"
                className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <div className="w-[1px] h-4 bg-gray-800 my-auto" />
              <button
                onClick={handleFitGraph}
                title="Fit Graph"
                aria-label="Fit Graph"
                className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setAnimationsPaused(!animationsPaused)}
                title={animationsPaused ? "Resume animations" : "Pause animations"}
                aria-label={animationsPaused ? "Resume animations" : "Pause animations"}
                className={`p-1.5 rounded hover:bg-gray-800 transition-colors cursor-pointer ${
                  animationsPaused ? "text-amber-400" : "text-gray-400 hover:text-white"
                }`}
              >
                {animationsPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
            </div>

            {loading && nodes.length === 0 ? (
              <div className="text-center space-y-2 py-24 text-gray-500 font-mono text-xs">
                <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Loading real on-chain topology from {cfg.network}...</p>
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
                    Technical Details {showErrorDetails ? "^" : "v"}
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
                width="100%"
                height="100%"
                className="w-full h-full select-none"
                style={{ overflow: "hidden" }}
              >
                <defs>
                  {/* Clean standard and active arrowheads */}
                  <marker
                    id="map-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#4B5563" />
                  </marker>
                  <marker
                    id="map-arrow-hover"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#9CA3AF" />
                  </marker>
                  <marker
                    id="map-arrow-active"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#38BDF8" />
                  </marker>
                  <marker
                    id="map-arrow-error"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#EF4444" />
                  </marker>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Viewport Transform Group for Zoom / Pan */}
                <g transform={`translate(${viewport.translateX}, ${viewport.translateY}) scale(${viewport.scale})`}>
                  {/* 1. EDGES */}
                  {edges.map((edge) => {
                    const fromNode = nodes.find((n) => n.id === edge.from);
                    const toNode = nodes.find((n) => n.id === edge.to);
                    if (!fromNode || !toNode) return null;

                    const isActive = activeEdgeId === edge.id;
                    const isHovered = hoveredEdgeId === edge.id;
                    const isPending = Boolean(edge.isPending);
                    const isError = Boolean(edge.isError);

                    const strokeColor = isError
                      ? "#EF4444"
                      : isActive
                      ? "#38BDF8"
                      : isHovered
                      ? "#94A3B8"
                      : isPending
                      ? "#F59E0B"
                      : "#374151";

                    const strokeWidth = isActive || isHovered || isPending ? 2.5 : 2;
                    const strokeDash = isPending ? "6,4" : "none";
                    const markerId = isError
                      ? "url(#map-arrow-error)"
                      : isActive
                      ? "url(#map-arrow-active)"
                      : isHovered
                      ? "url(#map-arrow-hover)"
                      : "url(#map-arrow)";

                    const { pathD, midX, midY } = computeEdgeGeometry(fromNode, toNode, edge.curveOffset || 0);
                    const pillWidth = Math.max(90, edge.label.length * 7.5 + 18);

                    return (
                      <g
                        key={edge.id}
                        onMouseEnter={() => setHoveredEdgeId(edge.id)}
                        onMouseLeave={() => setHoveredEdgeId(null)}
                        className="transition-opacity duration-200"
                      >
                        {/* Invisible broader hit area for easy hover */}
                        <path
                          d={pathD}
                          stroke="transparent"
                          strokeWidth="16"
                          fill="none"
                          className="cursor-pointer"
                        />

                        {/* Visible directed path */}
                        <path
                          d={pathD}
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          strokeDasharray={strokeDash}
                          fill="none"
                          markerEnd={markerId}
                          className="transition-colors duration-200"
                        />

                        {/* Edge Label Pill */}
                        <g transform={`translate(${midX}, ${midY})`} className="cursor-pointer select-none">
                          <rect
                            x={-pillWidth / 2}
                            y={-11}
                            width={pillWidth}
                            height={22}
                            rx={5}
                            fill="#0F1117"
                            stroke={isActive ? "#38BDF8" : isHovered ? "#64748B" : isError ? "#EF4444" : "#262936"}
                            strokeWidth="1.2"
                          />
                          <text
                            x="0"
                            y="4"
                            fill={isActive ? "#38BDF8" : isError ? "#EF4444" : isHovered ? "#F1F5F9" : "#94A3B8"}
                            fontSize="11"
                            fontFamily="ui-monospace, monospace"
                            fontWeight="500"
                            textAnchor="middle"
                            className="pointer-events-none"
                          >
                            {edge.label}
                          </text>
                        </g>

                        {/* Animated packet on real events */}
                        {isActive && !animationsPaused && (
                          <circle r="4.5" fill="#38BDF8" filter="url(#glow)">
                            <animateMotion path={pathD} dur="1.4s" repeatCount="1" fill="freeze" />
                          </circle>
                        )}
                      </g>
                    );
                  })}

                  {/* 2. NODES */}
                  {nodes.map((node) => {
                    const isSelected = selectedNodeId === node.id;
                    const isContract = node.kind === "contract";

                    const mainColor =
                      node.kind === "customer"
                        ? "#38BDF8"
                        : node.kind === "machine"
                        ? "#34D399"
                        : node.kind === "verifier"
                        ? "#FBBF24"
                        : "#A78BFA";

                    const bgColor =
                      node.kind === "customer"
                        ? "#081F2E"
                        : node.kind === "machine"
                        ? "#06281E"
                        : node.kind === "verifier"
                        ? "#291E06"
                        : "#1E1238";

                    return (
                      <g
                        key={node.id}
                        onClick={() => handleNodeClick(node.id)}
                        className="cursor-pointer group"
                      >
                        {/* Selection Glow & Ring */}
                        {isSelected && (
                          <>
                            {isContract ? (
                              <rect
                                x={node.x - 52}
                                y={node.y - 32}
                                width="104"
                                height="64"
                                rx="14"
                                fill="none"
                                stroke={mainColor}
                                strokeWidth="2.2"
                                strokeDasharray="6,3"
                                className="opacity-90"
                              />
                            ) : (
                              <circle
                                cx={node.x}
                                cy={node.y}
                                r="36"
                                fill="none"
                                stroke={mainColor}
                                strokeWidth="2.2"
                                strokeDasharray="6,3"
                                className="opacity-90"
                              />
                            )}
                          </>
                        )}

                        {/* Node Shape */}
                        {isContract ? (
                          // Smart Contract: Rounded Rectangle
                          <rect
                            x={node.x - 44}
                            y={node.y - 25}
                            width="88"
                            height="50"
                            rx="10"
                            fill={bgColor}
                            stroke={mainColor}
                            strokeWidth="2.2"
                            className="transition-transform duration-200 group-hover:scale-105"
                          />
                        ) : (
                          // Wallets & Verifiers: Circle
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r="28"
                            fill={bgColor}
                            stroke={mainColor}
                            strokeWidth="2.2"
                            className="transition-transform duration-200 group-hover:scale-105"
                          />
                        )}

                        {/* Node Icon */}
                        {node.kind === "customer" && (
                          <g transform={`translate(${node.x - 10}, ${node.y - 10})`} className="pointer-events-none">
                            <Wallet className="w-5 h-5 text-cyan-400" />
                          </g>
                        )}
                        {node.kind === "machine" && (
                          <g transform={`translate(${node.x - 10}, ${node.y - 10})`} className="pointer-events-none">
                            <Cpu className="w-5 h-5 text-emerald-400" />
                          </g>
                        )}
                        {node.kind === "verifier" && (
                          <g transform={`translate(${node.x - 10}, ${node.y - 10})`} className="pointer-events-none">
                            <ShieldCheck className="w-5 h-5 text-amber-400" />
                          </g>
                        )}
                        {node.kind === "contract" && (
                          <g transform={`translate(${node.x - 9}, ${node.y - 9})`} className="pointer-events-none">
                            {node.id === "escrow" ? (
                              <Lock className="w-4 h-4 text-purple-400" />
                            ) : (
                              <Layers className="w-4 h-4 text-purple-400" />
                            )}
                          </g>
                        )}

                        {/* Node Labels Pill (Main + SubLabel below node without overlapping) */}
                        <g transform={`translate(${node.x}, ${node.y + (isContract ? 42 : 44)})`}>
                          <rect
                            x={-72}
                            y={-3}
                            width={144}
                            height={34}
                            rx={6}
                            fill="#0B0B0E"
                            fillOpacity="0.88"
                            stroke="#1E222D"
                            strokeWidth="1"
                          />
                          <text
                            x="0"
                            y="11"
                            fill="#F8FAFC"
                            fontSize="13"
                            fontWeight="600"
                            fontFamily="sans-serif"
                            textAnchor="middle"
                          >
                            {node.label}
                          </text>
                          {node.subLabel && (
                            <text
                              x="0"
                              y="25"
                              fill="#94A3B8"
                              fontSize="10"
                              fontFamily="ui-monospace, monospace"
                              textAnchor="middle"
                            >
                              {node.subLabel}
                            </text>
                          )}
                        </g>
                      </g>
                    );
                  })}
                </g>
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
                        ? "#38BDF8"
                        : selectedNode?.kind === "machine"
                        ? "#34D399"
                        : selectedNode?.kind === "verifier"
                        ? "#FBBF24"
                        : "#A78BFA",
                  }}
                />
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 font-mono">
                  {selectedNode?.label || "Node Details"}
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                {selectedNode?.kind?.toUpperCase()}
              </span>
            </div>

            {selectedNode && (
              <div className="space-y-3 font-mono text-xs">
                <div>
                  <span className="text-gray-500 text-[10px] uppercase">Address</span>
                  <div className="flex items-center justify-between gap-2 mt-0.5 p-2 rounded bg-gray-50 border border-gray-200 text-gray-900">
                    <span className="truncate">
                      {selectedNode.address.slice(0, 10)}...{selectedNode.address.slice(-8)}
                    </span>
                    <button
                      onClick={() => copyText("addr", selectedNode.address)}
                      className="text-gray-500 hover:text-gray-900 cursor-pointer"
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

                {selectedNode.kind === "machine" && (
                  <div className="rounded border border-emerald-100 bg-emerald-50 p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-emerald-800">Live 3D machine</span>
                      <span className={selectedSimulatorStatus?.connected ? "text-emerald-700 font-medium" : "text-gray-500"}>
                        {selectedSimulatorStatus?.connected ? selectedSimulatorStatus.robotState : "Offline"}
                      </span>
                    </div>
                    <a
                      href={SIMULATOR_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 underline underline-offset-2"
                    >
                      Open live 3D simulator <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Create Job Form */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 shadow-xs">
            <div className="border-b border-gray-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 font-mono">
                Create Escrow Job
              </h3>
              <p className="text-[11px] text-gray-500">
                Deposit native {NATIVE_SYMBOL} into JobEscrow vault for autonomous machine dispatch.
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
                <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-[11px] space-y-1.5">
                  <div>{formError}</div>
                  {suggestedReward && Number(suggestedReward) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormReward(Number(suggestedReward).toFixed(4));
                        setFormError(null);
                        setSuggestedReward(null);
                      }}
                      className="inline-block text-left text-[11px] font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer"
                    >
                      ⚡ Use max safe reward ({Number(suggestedReward).toFixed(4)} {NATIVE_SYMBOL})
                    </button>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={formSubmitting || !signer}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {formSubmitting
                    ? "Locking Funds..."
                    : `Lock ${formReward} ${NATIVE_SYMBOL} & Create Job`}
                </span>
              </button>
            </form>
          </div>

          {/* Real Contract Activity Feed */}
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
                      <span>Tx: {ev.txHash.slice(0, 10)}...</span>
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
