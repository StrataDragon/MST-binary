import React, { useState } from "react";
import { formatEther, ZeroAddress } from "ethers";
import {
  Lock,
  Cpu,
  Navigation,
  FileSignature,
  ShieldCheck,
  Zap,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Play,
  ArrowRight,
  Info,
  Layers,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { cfg, DEFAULT_EVIDENCE_TARGET } from "../lib/config";
import { machineApi } from "../lib/api";
import { getEscrow, decodeContractError } from "../lib/wallet";
import { JobSummary, statusLabel } from "./JobList";

interface TransactionFlowGraphProps {
  job: any | null;
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
  jobsList: JobSummary[];
  signer: any;
  onRefresh: () => void;
  onOpenCreate: () => void;
}

interface FlowNode {
  id: string;
  stepNumber: number;
  title: string;
  subtitle: string;
  icon: any;
  status: "completed" | "active" | "pending" | "failed";
  badge: string;
  dataPill: string;
  description: string;
  caller?: string;
  contract?: string;
  functionCall?: string;
  eip712Type?: string;
  payloadSnippet?: Record<string, any>;
}

export function TransactionFlowGraph({
  job,
  selectedJobId,
  onSelectJob,
  jobsList,
  signer,
  onRefresh,
  onOpenCreate,
}: TransactionFlowGraphProps) {
  const [selectedNode, setSelectedNode] = useState<string>("node-1");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    "MachinaPay Flow Engine initialized. Listening to MST blockchain...",
  ]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const state = job ? Number(job.state) : 0;
  const verdict = job ? Number(job.verdict) : 0;
  const rewardEth = job ? formatEther(job.reward || 0) : "100";
  const currentStatus = statusLabel(state, verdict);

  function log(msg: string) {
    setConsoleLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 12));
  }

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  // Node state resolver
  function getNodeStatus(step: number): "completed" | "active" | "pending" | "failed" {
    if (!job) return step === 1 ? "active" : "pending";

    // If job was refunded
    if (state === 7) {
      if (step <= 3) return "completed";
      if (step === 6) return "failed";
      return "pending";
    }

    if (step === 1) return state >= 1 ? "completed" : "active";
    if (step === 2) {
      if (state >= 2) return "completed";
      if (state === 1) return "active";
      return "pending";
    }
    if (step === 3) {
      if (state >= 4) return "completed";
      if (state === 2 || state === 3) return "active";
      return "pending";
    }
    if (step === 4) {
      if (state >= 4) return "completed";
      if (state === 3) return "active";
      return "pending";
    }
    if (step === 5) {
      if (state >= 6) return "completed";
      if (state === 4 && verdict === 2) return "failed";
      if (state === 4 || state === 5) return "active";
      return "pending";
    }
    if (step === 6) {
      if (state === 6) return "completed";
      if (state === 5) return "active";
      return "pending";
    }
    return "pending";
  }

  // Define the 6 sequential nodes + 1 refund branch
  const nodes: FlowNode[] = [
    {
      id: "node-1",
      stepNumber: 1,
      title: "1. Escrow Lock",
      subtitle: "Customer Deposit",
      icon: Lock,
      status: getNodeStatus(1),
      badge: state >= 1 ? "FUNDED" : "AWAITING",
      dataPill: `${rewardEth} ${cfg.nativeToken}`,
      description:
        "Customer deposits native MST coin into JobEscrow.sol and binds target delivery zone coordinates. Funds remain locked until dual EIP-712 cryptographic proofs verify completion.",
      contract: cfg.addresses.JobEscrow,
      functionCall: "createJob(bytes32,bytes32,uint256,string)",
      caller: job?.customer ? `${job.customer.slice(0, 10)}…` : "0xf39F…2266",
      payloadSnippet: {
        reward: `${rewardEth} ${cfg.nativeToken}`,
        deadline: job ? new Date(Number(job.deadline) * 1000).toLocaleTimeString() : "60 min",
        targetZone: DEFAULT_EVIDENCE_TARGET.target.zone,
        coords: DEFAULT_EVIDENCE_TARGET.target,
      },
    },
    {
      id: "node-2",
      stepNumber: 2,
      title: "2. Fleet Registry",
      subtitle: "Machine Stake & Lock",
      icon: Cpu,
      status: getNodeStatus(2),
      badge: state >= 2 ? "CLAIMED" : "DISPATCHING",
      dataPill: "M-042 (0.01 MST)",
      description:
        "Machine agent M-042 validates that adequate economic collateral is staked in MachineRegistry.sol, then calls acceptJob() to claim the job and lock out competing machines.",
      contract: cfg.addresses.MachineRegistry,
      functionCall: "acceptJob(bytes32) -> startExecution(bytes32)",
      caller: job?.machineWallet !== ZeroAddress ? `${job?.machineWallet?.slice(0, 10)}…` : "M-042 Agent",
      payloadSnippet: {
        machineId: "M-042",
        stakedCollateral: "0.01 MST",
        operator: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        state: state >= 2 ? "LOCKED_FOR_EXECUTION" : "READY_IN_FLEET",
      },
    },
    {
      id: "node-3",
      stepNumber: 3,
      title: "3. Physical Navigation",
      subtitle: "Telemetry & Arrival",
      icon: Navigation,
      status: getNodeStatus(3),
      badge: state >= 4 ? "ARRIVED" : state === 3 ? "IN-TRANSIT" : "STANDBY",
      dataPill: "Target: (9, 4)",
      description:
        "Autonomous drone/robot navigates the 10x10 delivery grid to the target drop coordinates. On-board odometry records package delivery confirmation and sensor digest.",
      payloadSnippet: {
        packageId: DEFAULT_EVIDENCE_TARGET.packageId,
        target: DEFAULT_EVIDENCE_TARGET.target,
        finalPosition: state >= 4 ? DEFAULT_EVIDENCE_TARGET.target : { x: 1, y: 1 },
        delivered: state >= 4,
        distanceDelta: state >= 4 ? "0.00 meters" : "Pending",
      },
    },
    {
      id: "node-4",
      stepNumber: 4,
      title: "4. EIP-712 Signer",
      subtitle: "Hardware Attestation",
      icon: FileSignature,
      status: getNodeStatus(4),
      badge: state >= 4 ? "ECDSA SIGNED" : "PENDING",
      dataPill: "v=28 (secp256k1)",
      description:
        "Machine hardware enclave signs typed structured data (JobExecutionProof) using MACHINE_PRIVATE_KEY. Proves authenticity of the sensor telemetry without on-chain gas costs.",
      eip712Type: "JobExecutionProof",
      contract: cfg.eip712.verifyingContract,
      payloadSnippet: {
        domain: cfg.eip712.name,
        verifyingContract: cfg.eip712.verifyingContract,
        primaryType: "JobExecutionProof",
        signer: job?.machineWallet !== ZeroAddress ? job?.machineWallet : "0x7099…79C8",
        signature: state >= 4 ? "0x5a18a99477...fc0b2927d2 (65 bytes)" : "Awaiting sensor capture",
      },
    },
    {
      id: "node-5",
      stepNumber: 5,
      title: "5. Off-Chain Verifier",
      subtitle: "Rule Engine & Countersig",
      icon: ShieldCheck,
      status: getNodeStatus(5),
      badge:
        state >= 6
          ? "ATTESTED"
          : state === 4 && verdict === 2
          ? "REJECTED"
          : state >= 4
          ? "VERIFYING"
          : "PENDING",
      dataPill: verdict === 2 ? "FAIL" : "PASS",
      description:
        "Member 3's Express verification engine (:4000) recovers the machine signer, checks delivery coordinate tolerance (<= 0.05m), and issues an EIP-712 countersignature (Attestation).",
      eip712Type: "Attestation",
      caller: cfg.verifier,
      payloadSnippet: {
        verifierEndpoint: "http://localhost:4000",
        ruleCheck: state >= 4 ? (verdict === 2 ? "DISTANCE_EXCEEDED" : "COORDINATES_MATCHED") : "WAITING",
        verifierAddress: cfg.verifier,
        countersignature: state >= 4 ? "0x885b872b6cb3...fdd24d40c3 (65 bytes)" : "Pending",
      },
    },
    {
      id: "node-6",
      stepNumber: 6,
      title: "6. On-Chain Settlement",
      subtitle: state === 7 ? "Refund to Customer" : "Native MST Released",
      icon: state === 7 ? RotateCcw : Zap,
      status: getNodeStatus(6),
      badge: state === 6 ? "PAID" : state === 7 ? "REFUNDED" : "AWAITING",
      dataPill: state === 6 ? `${rewardEth} MST Paid` : state === 7 ? "Refunded" : "Locked",
      description:
        state === 7
          ? "Timeout or failure condition reached. JobEscrow.refund() returns deposited MST back to customer wallet."
          : "JobEscrow.releasePayment() verifies both EIP-712 signatures on-chain and transfers native MST reward directly to the machine wallet.",
      contract: cfg.addresses.JobEscrow,
      functionCall: state === 7 ? "refund(bytes32)" : "releasePayment(bytes32,...)",
      payloadSnippet: {
        recipient: state === 6 ? "M-042 Machine Wallet" : state === 7 ? "Customer" : "JobEscrow Vault",
        amount: `${rewardEth} ${cfg.nativeToken}`,
        finality: state >= 6 ? "MST Ledger Block Confirmed" : "Pending Execution",
      },
    },
  ];

  const activeNodeData = nodes.find((n) => n.id === selectedNode) || nodes[0];

  // Action Handlers
  async function handleAccept() {
    if (!selectedJobId) return;
    setBusyAction("accept");
    try {
      log(`Calling machine agent to accept job ${selectedJobId.slice(0, 8)}...`);
      const res = await machineApi.acceptJob(selectedJobId);
      log(`Machine accepted job! (Tx: ${res.acceptTx?.slice(0, 10)}…)`);
      onRefresh();
    } catch (e: any) {
      log(`Accept failed: ${e.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReport(mode: "success" | "fail") {
    if (!selectedJobId) return;
    setBusyAction(mode);
    const { packageId, target } = DEFAULT_EVIDENCE_TARGET;
    try {
      log(`Transmitting ${mode} sensor evidence to verifier engine...`);
      const res = await machineApi.submitEvidence(selectedJobId, {
        packageId,
        target,
        finalPosition: mode === "success" ? { x: target.x, y: target.y } : { x: 1, y: 1 },
        delivered: mode === "success",
        result: mode,
      });

      if (res.verification?.passed) {
        log(`Attestation verified! Settle Tx: ${res.verification?.settleTx?.slice(0, 10)}…`);
      } else {
        log(`Verifier rejected evidence. Verdict: REJECT`);
      }
      onRefresh();
    } catch (e: any) {
      log(`Evidence submission failed: ${e.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRefund() {
    if (!selectedJobId) return;
    if (!signer) return log("Connect customer wallet to claim refund.");
    setBusyAction("refund");
    const escrow = getEscrow(signer);
    try {
      log("Submitting refund transaction to JobEscrow...");
      const tx = await escrow.refund(selectedJobId);
      await tx.wait();
      log(`Refund confirmed! (Tx: ${tx.hash.slice(0, 10)}…)`);
      onRefresh();
    } catch (e: any) {
      log(`Refund failed: ${decodeContractError(e, escrow)}`);
    } finally {
      setBusyAction(null);
    }
  }

  // Styles using MachinaPay color tokens
  const nodeStatusClasses = {
    completed: "border-ok/60 bg-panel text-ok shadow-[0_0_12px_rgba(94,230,168,0.15)]",
    active: "border-signal/80 bg-[#161e19] text-signal shadow-[0_0_14px_rgba(255,176,46,0.2)]",
    pending: "border-line/60 bg-panel/60 text-dim opacity-75 hover:opacity-100",
    failed: "border-bad/70 bg-[#1c1313] text-bad shadow-[0_0_12px_rgba(255,107,94,0.2)]",
  };

  const badgeClasses = {
    completed: "bg-ok/15 text-ok border-ok/30",
    active: "bg-signal/15 text-signal border-signal/30",
    pending: "bg-line/40 text-dim border-line",
    failed: "bg-bad/15 text-bad border-bad/30",
  };

  return (
    <div className="space-y-5">
      {/* Top Controls: Job Switcher & Status */}
      <div className="rounded-xl border border-line bg-panel p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-signal animate-pulse" />
            <h2 className="text-base font-bold text-white tracking-tight">
              MachinaPay Autonomous Transaction Pipeline
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-ink border border-line text-signal font-semibold">
              EIP-712 DAG
            </span>
          </div>
          <p className="text-xs text-dim mt-0.5">
            Real-time interactive node graph representing the machine job & escrow lifecycle on MST ledger.
          </p>
        </div>

        {/* Job Selector + Post Job */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <select
              value={selectedJobId || ""}
              onChange={(e) => onSelectJob(e.target.value)}
              className="w-full bg-ink border border-line rounded-lg px-3 py-1.5 text-xs text-white font-mono appearance-none focus:outline-none focus:border-signal cursor-pointer"
            >
              {jobsList.map((j) => (
                <option key={j.jobId} value={j.jobId}>
                  Job {j.jobId.slice(0, 8)}… ({j.reward} MST · {statusLabel(j.state, j.verdict).text})
                </option>
              ))}
              {jobsList.length === 0 && <option value="">No jobs found</option>}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-dim absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={onOpenCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-signal hover:brightness-110 text-ink text-xs font-bold transition-all shadow-sm flex-shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Post Job</span>
          </button>
        </div>
      </div>

      {/* Main Flow Canvas & Telemetry Drawer (Grid 12 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (8 cols): Interactive Node Flow Canvas */}
        <div className="lg:col-span-8 rounded-xl border border-line bg-panel p-5 space-y-5 relative">
          <div className="flex items-center justify-between border-b border-line/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase text-dim tracking-wider">Current Pipeline State:</span>
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${
                  badgeClasses[getNodeStatus(state === 6 ? 6 : state >= 4 ? 5 : state >= 2 ? 2 : 1)]
                }`}
              >
                {currentStatus.text}
              </span>
            </div>

            <span className="text-[11px] text-dim font-mono">
              Click node to inspect cryptographic payload
            </span>
          </div>

          {/* Node Grid Layout (2 rows of 3 nodes with connecting arrows) */}
          <div className="space-y-4">
            {/* Top Row: Nodes 1, 2, 3 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {nodes.slice(0, 3).map((node) => {
                const Icon = node.icon;
                const isSelected = selectedNode === node.id;

                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(node.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 relative ${
                      nodeStatusClasses[node.status]
                    } ${isSelected ? "ring-2 ring-signal" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-7 h-7 rounded-lg bg-ink flex items-center justify-center border border-line">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span
                        className={`text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase font-bold ${
                          badgeClasses[node.status]
                        }`}
                      >
                        {node.badge}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-white tracking-wide">{node.title}</h4>
                    <p className="text-[10px] text-dim font-mono mb-2">{node.subtitle}</p>

                    <div className="py-1 px-2 rounded bg-ink border border-line/50 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-dim">Value:</span>
                      <span className="font-semibold text-white/90">{node.dataPill}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Connecting Flow Edge indicator */}
            <div className="flex items-center justify-around px-8 text-dim font-mono text-xs">
              <span className="text-signal flex items-center gap-1 animate-pulse">
                ↓ Trajectory Hand-off
              </span>
              <span className="text-signal flex items-center gap-1 animate-pulse">
                ↓ Sensor Evidence
              </span>
              <span className="text-signal flex items-center gap-1 animate-pulse">
                ↓ ECDSA Signing
              </span>
            </div>

            {/* Bottom Row: Nodes 4, 5, 6 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {nodes.slice(3, 6).map((node) => {
                const Icon = node.icon;
                const isSelected = selectedNode === node.id;

                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(node.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 relative ${
                      nodeStatusClasses[node.status]
                    } ${isSelected ? "ring-2 ring-signal" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-7 h-7 rounded-lg bg-ink flex items-center justify-center border border-line">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span
                        className={`text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase font-bold ${
                          badgeClasses[node.status]
                        }`}
                      >
                        {node.badge}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-white tracking-wide">{node.title}</h4>
                    <p className="text-[10px] text-dim font-mono mb-2">{node.subtitle}</p>

                    <div className="py-1 px-2 rounded bg-ink border border-line/50 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-dim">Value:</span>
                      <span className="font-semibold text-white/90">{node.dataPill}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive Action Control Strip */}
          <div className="pt-3 border-t border-line/60 flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-[11px] font-mono text-dim">Stage Execution Triggers:</span>

            <div className="flex flex-wrap items-center gap-2">
              <button
                disabled={busyAction !== null || state !== 1}
                onClick={handleAccept}
                className="px-3 py-1.5 rounded-lg bg-signal text-ink font-bold text-xs hover:brightness-110 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-sm"
              >
                1 · Machine: Accept Job
              </button>
              <button
                disabled={busyAction !== null || state !== 3}
                onClick={() => handleReport("success")}
                className="px-3 py-1.5 rounded-lg bg-ok text-ink font-bold text-xs hover:brightness-110 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-sm"
              >
                2 · Robot: Delivered (Release)
              </button>
              <button
                disabled={busyAction !== null || state !== 3}
                onClick={() => handleReport("fail")}
                className="px-3 py-1.5 rounded-lg bg-bad text-white font-bold text-xs hover:brightness-110 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-sm"
              >
                2b · Robot: Missed Target (Fail)
              </button>
              <button
                disabled={busyAction !== null || ![1, 2, 3, 4].includes(state)}
                onClick={handleRefund}
                className="px-3 py-1.5 rounded-lg border border-line bg-ink text-dim hover:text-white font-semibold text-xs disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                Request Refund
              </button>
            </div>
          </div>

          {/* Mini Log Strip */}
          <div className="p-2.5 rounded-lg bg-ink border border-line font-mono text-[11px] text-dim space-y-0.5 max-h-24 overflow-y-auto">
            {consoleLogs.map((l, i) => (
              <div key={i} className="text-white/80">
                <span className="text-signal">›</span> {l}
              </div>
            ))}
          </div>
        </div>

        {/* Right Column (4 cols): Cryptographic Telemetry Drawer */}
        <div className="lg:col-span-4 rounded-xl border border-line bg-panel p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-line/60 pb-3">
              <div>
                <span className="text-[10px] font-mono text-signal uppercase tracking-wider">
                  Stage 0{activeNodeData.stepNumber} Telemetry
                </span>
                <h3 className="text-sm font-bold text-white">{activeNodeData.title}</h3>
              </div>
              <span
                className={`text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase font-bold ${
                  badgeClasses[activeNodeData.status]
                }`}
              >
                {activeNodeData.badge}
              </span>
            </div>

            <p className="text-xs text-dim leading-relaxed font-sans">{activeNodeData.description}</p>

            {/* Smart contract & caller details */}
            <div className="p-3 rounded-lg bg-ink border border-line/60 space-y-2 text-[11px] font-mono">
              {activeNodeData.contract && (
                <div>
                  <span className="text-dim block">Contract Target</span>
                  <div className="flex items-center justify-between">
                    <span className="text-white/90 truncate">{activeNodeData.contract}</span>
                    <button
                      onClick={() => handleCopy(activeNodeData.contract!, "c")}
                      className="text-dim hover:text-signal ml-1"
                    >
                      {copiedKey === "c" ? <Check className="w-3 h-3 text-ok" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              )}

              {activeNodeData.functionCall && (
                <div>
                  <span className="text-dim block">Function Selector</span>
                  <span className="text-signal font-semibold">{activeNodeData.functionCall}</span>
                </div>
              )}

              {activeNodeData.caller && (
                <div>
                  <span className="text-dim block">Sender / Identity</span>
                  <span className="text-white/90">{activeNodeData.caller}</span>
                </div>
              )}
            </div>

            {/* Payload JSON Inspector */}
            {activeNodeData.payloadSnippet && (
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-dim uppercase">Cryptographic Payload:</span>
                <pre className="p-2.5 rounded-lg bg-ink border border-line text-[10px] font-mono text-ok overflow-x-auto">
                  {JSON.stringify(activeNodeData.payloadSnippet, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <div className="p-2.5 rounded-lg bg-ok/10 border border-ok/30 text-[11px] text-ok flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Dual EIP-712 security active on MST ledger</span>
          </div>
        </div>
      </div>
    </div>
  );
}
