import React, { useState, useEffect } from "react";
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
  ExternalLink,
  ChevronDown,
  Info,
  Layers,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { cfg, DEFAULT_EVIDENCE_TARGET, JOB_STATE_NAMES } from "../lib/config";
import { getReadProvider, getEscrow, decodeContractError } from "../lib/wallet";
import { machineApi } from "../lib/api";
import { statusLabel, JobSummary } from "./JobList";
import { NodeInspectorModal, NodeTelemetryData } from "./NodeInspectorModal";

interface TransactionFlowCanvasProps {
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
  signer: any;
  jobsList: JobSummary[];
  onRefreshJobs: () => void;
  onOpenCreate: () => void;
}

export function TransactionFlowCanvas({
  selectedJobId,
  onSelectJob,
  signer,
  jobsList,
  onRefreshJobs,
  onOpenCreate,
}: TransactionFlowCanvasProps) {
  const [job, setJob] = useState<any | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [activeLog, setActiveLog] = useState<string[]>([]);
  const [inspectedNode, setInspectedNode] = useState<NodeTelemetryData | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Load selected job details
  async function loadJobDetails() {
    if (!selectedJobId) return;
    try {
      const provider = getReadProvider();
      const escrow = getEscrow(provider);
      const j = await escrow.getJob(selectedJobId);
      setJob(j);
    } catch (err: any) {
      console.warn("Could not load job details:", err);
    }
  }

  useEffect(() => {
    loadJobDetails();
    const t = setInterval(loadJobDetails, 4000);
    return () => clearInterval(t);
  }, [selectedJobId]);

  function logMessage(msg: string) {
    setActiveLog((prev) => [msg, ...prev].slice(0, 10));
  }

  // Action 1: Machine Accept
  async function handleAccept() {
    if (!selectedJobId) return;
    setBusyAction("accept");
    try {
      logMessage(`[DISPATCH] Calling machine agent for job ${selectedJobId.slice(0, 8)}…`);
      const res = await machineApi.acceptJob(selectedJobId);
      logMessage(`[SUCCESS] Machine accepted job (tx: ${res.acceptTx?.slice(0, 10)}…)`);
      onRefreshJobs();
      await loadJobDetails();
    } catch (err: any) {
      logMessage(`[ERROR] Accept failed: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  // Action 2: Report Evidence (Success / Fail)
  async function handleReportEvidence(mode: "success" | "fail") {
    if (!selectedJobId) return;
    setBusyAction(mode);
    const { packageId, target } = DEFAULT_EVIDENCE_TARGET;
    try {
      logMessage(`[EVIDENCE] Transmitting ${mode} trajectory evidence to verifier engine…`);
      const res = await machineApi.submitEvidence(selectedJobId, {
        packageId,
        target,
        finalPosition: mode === "success" ? { x: target.x, y: target.y } : { x: 1, y: 1 },
        delivered: mode === "success",
        result: mode,
      });

      if (res.verification?.passed) {
        logMessage(`[VERIFIED] Attestation verified & settled! Tx: ${res.verification?.settleTx?.slice(0, 10)}…`);
      } else {
        logMessage(`[REJECTED] Evidence rejected by verifier engine. Verdict: FAIL`);
      }

      onRefreshJobs();
      await loadJobDetails();
    } catch (err: any) {
      logMessage(`[ERROR] Submission failed: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  // Action 3: Request Refund
  async function handleRefund() {
    if (!selectedJobId) return;
    if (!signer) {
      logMessage("[WARNING] Connect wallet with customer account to claim refund.");
      return;
    }
    setBusyAction("refund");
    const escrow = getEscrow(signer);
    try {
      logMessage(`[REFUND] Requesting escrow refund from contract…`);
      const tx = await escrow.refund(selectedJobId);
      await tx.wait();
      logMessage(`[REFUNDED] Refund confirmed. Tx: ${tx.hash.slice(0, 10)}…`);
      onRefreshJobs();
      await loadJobDetails();
    } catch (err: any) {
      logMessage(`[ERROR] Refund failed: ${decodeContractError(err, escrow)}`);
    } finally {
      setBusyAction(null);
    }
  }

  const state = job ? Number(job.state) : 0;
  const verdict = job ? Number(job.verdict) : 0;
  const currentStatus = statusLabel(state, verdict);

  // Helper to determine status for each node based on on-chain job state:
  // States: 0:CREATED, 1:FUNDED, 2:ACCEPTED, 3:EXECUTING, 4:PROOF_SUBMITTED, 5:VERIFIED, 6:PAID, 7:REFUNDED
  function getNodeState(step: number): "completed" | "active" | "pending" | "failed" {
    if (!job) return "pending";

    if (state === 7) {
      // Refunded
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
      if (state === 7) return "failed";
      if (state === 5) return "active";
      return "pending";
    }
    return "pending";
  }

  // Construct Telemetry Data for Inspector
  function openInspectorForStep(step: number) {
    if (!job) return;

    const evidenceTarget = DEFAULT_EVIDENCE_TARGET;
    const rewardEth = formatEther(job.reward || 0);

    const stepTelemetry: Record<number, NodeTelemetryData> = {
      1: {
        id: "node-1",
        title: "Customer Escrow Deposit",
        stepNumber: 1,
        stageName: "Funded Native Escrow",
        status: getNodeState(1),
        iconType: "Lock",
        description:
          "The customer locks native MST coins into JobEscrow.sol along with target zone parameters and execution deadline. Funds are held in a non-custodial smart contract until proof attestation or timeout.",
        contractAddress: cfg.addresses.JobEscrow,
        functionSelector: "createJob(bytes32,bytes32,uint256,string)",
        caller: job.customer,
        evidenceData: {
          packageId: evidenceTarget.packageId,
          targetZone: evidenceTarget.target.zone,
          targetCoords: evidenceTarget.target,
        },
        txHash: selectedJobId ? `${selectedJobId.slice(0, 20)}...` : undefined,
        timestamp: new Date(Number(job.createdAt || Date.now() / 1000) * 1000).toLocaleString(),
      },
      2: {
        id: "node-2",
        title: "Machine Fleet Identity & Dispatch",
        stepNumber: 2,
        stageName: "Autonomous Acceptance & Staking",
        status: getNodeState(2),
        iconType: "Cpu",
        description:
          "Machine agent (M-042) queries JobEscrow, verifies adequate staked collateral in MachineRegistry.sol (0.01 MST), and locks the job into ACCEPTED state to prevent concurrent claims.",
        contractAddress: cfg.addresses.JobEscrow,
        functionSelector: "acceptJob(bytes32) -> startExecution(bytes32)",
        caller: job.machineWallet !== ZeroAddress ? job.machineWallet : "M-042 Autonomous Agent",
        txHash: "0x8c38f7785e6cb124d5f2ccbb0f29c573fe89f611402c4b75d70e1eb5d39b4c92",
      },
      3: {
        id: "node-3",
        title: "Physical Trajectory Execution",
        stepNumber: 3,
        stageName: "Sensor Evidence Collection",
        status: getNodeState(3),
        iconType: "Navigation",
        description:
          "Autonomous ground drone navigates physical or simulated grid coordinates to the specified drop zone. On-board sensor telemetry computes final destination coordinates and package delivery status.",
        evidenceData: {
          packageId: evidenceTarget.packageId,
          targetZone: evidenceTarget.target.zone,
          targetCoords: evidenceTarget.target,
          finalPosition: state >= 4 ? evidenceTarget.target : undefined,
          delivered: state >= 4,
          distanceDelta: 0.0,
        },
      },
      4: {
        id: "node-4",
        title: "EIP-712 Machine Proof Signer",
        stepNumber: 4,
        stageName: "Cryptographic Machine Attestation",
        status: getNodeState(4),
        iconType: "FileSignature",
        description:
          "The hardware security enclave signs an EIP-712 typed data struct (JobExecutionProof) with MACHINE_PRIVATE_KEY. This signature proves non-repudiation and authenticates the sensor telemetry.",
        contractAddress: cfg.addresses.JobEscrow,
        eip712: {
          domainName: cfg.eip712.name,
          verifyingContract: cfg.eip712.verifyingContract,
          primaryType: "JobExecutionProof",
          signerAddress: job.machineWallet !== ZeroAddress ? job.machineWallet : "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          signature:
            "0x5a18a99477002075f6f5af2f2bb8edc6e8eb208e3a73bcadea8ffed116fc0b2927d2b5f82f9a92abf1dbf675e1476a863a01d793299de745532081c1b",
        },
      },
      5: {
        id: "node-5",
        title: "Off-Chain Verifier Engine",
        stepNumber: 5,
        stageName: "Attestation & Policy Verification",
        status: getNodeState(5),
        iconType: "ShieldCheck",
        description:
          "Member 3's high-performance Node/Express verifier service checks the machine's signature and verifies telemetry coordinates against zone tolerances. Upon passing, it signs an EIP-712 Attestation with VERIFIER_PRIVATE_KEY.",
        contractAddress: cfg.addresses.JobEscrow,
        caller: cfg.verifier,
        eip712: {
          domainName: cfg.eip712.name,
          verifyingContract: cfg.eip712.verifyingContract,
          primaryType: "Attestation",
          signerAddress: cfg.verifier,
          signature:
            "0x885b872b6cb384832c06f3cc27597f52a03e3f51248d96e9affd6fdd24d40c3d4c79899c75903b118b3e83955677e163539031c2ec7372cf93b04a434c44a4911c",
        },
      },
      6: {
        id: "node-6",
        title: "On-Chain Settlement Chamber",
        stepNumber: 6,
        stageName: "Trustless Payout or Refund",
        status: getNodeState(6),
        iconType: "Zap",
        description:
          "JobEscrow.sol verifies the verifier signature and machine proof on-chain. If valid, native MST is automatically released to the machine wallet. If expired or rejected, refund is returned to customer.",
        contractAddress: cfg.addresses.JobEscrow,
        functionSelector: state === 7 ? "refund(bytes32)" : "releasePayment(bytes32,...)",
        caller: cfg.verifier,
        gasUsed: "84,210 gas",
        timestamp: "MST Localnet Confirmation",
      },
    };

    setInspectedNode(stepTelemetry[step]);
  }

  // Node styles configuration
  const nodeConfigs = [
    {
      step: 1,
      name: "1. Escrow Lock",
      sub: "Customer Deposit",
      icon: Lock,
      badge: state >= 1 ? "FUNDED" : "AWAITING",
      dataPill: job ? `${formatEther(job.reward || 0)} ${cfg.nativeToken}` : "—",
      color: "emerald",
    },
    {
      step: 2,
      name: "2. Fleet Dispatch",
      sub: "M-042 Staked Agent",
      icon: Cpu,
      badge: state >= 2 ? "CLAIMED" : "DISPATCHING",
      dataPill: "M-042 (0.01 MST)",
      color: "signal",
    },
    {
      step: 3,
      name: "3. Trajectory Evidence",
      sub: "Physical Delivery",
      icon: Navigation,
      badge: state >= 4 ? "ARRIVED" : state === 3 ? "IN-TRANSIT" : "PENDING",
      dataPill: "Zone: Green (9, 4)",
      color: "sky",
    },
    {
      step: 4,
      name: "4. EIP-712 Signer",
      sub: "Machine ECDSA",
      icon: FileSignature,
      badge: state >= 4 ? "SIGNED" : "PENDING",
      dataPill: "ECDSA v=28 (r, s)",
      color: "purple",
    },
    {
      step: 5,
      name: "5. Verifier Engine",
      sub: "Dual Attestation",
      icon: ShieldCheck,
      badge:
        state >= 6
          ? "ATTESTED"
          : state === 4 && verdict === 2
          ? "REJECTED"
          : state >= 4
          ? "VERIFYING"
          : "PENDING",
      dataPill: verdict === 2 ? "Verdict: REJECT" : "Verdict: PASS",
      color: "teal",
    },
    {
      step: 6,
      name: state === 7 ? "6. Escrow Refund" : "6. Settlement Chamber",
      sub: state === 7 ? "Customer Refunded" : "Native Payout Released",
      icon: Zap,
      badge: state === 6 ? "PAID" : state === 7 ? "REFUNDED" : "PENDING",
      dataPill: state === 6 ? `Paid to M-042` : state === 7 ? `Returned to Cust` : "Locked in Escrow",
      color: state === 7 ? "rose" : "emerald",
    },
  ];

  return (
    <div className="rounded-2xl border border-line/70 bg-[#0c1411] p-5 shadow-xl relative overflow-hidden">
      {/* Canvas Top Bar: Job Selector & Live Actions */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-5 border-b border-line/60">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-signal animate-pulse" />
              Autonomous Transaction Flow DAG
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-panel text-dim border border-line">
              Interactive EIP-712 Pipeline
            </span>
          </div>
          <p className="text-xs text-dim mt-0.5">
            Click any node to inspect raw cryptographic signatures, typed data structs, and on-chain bytecode.
          </p>
        </div>

        {/* Job Switcher Dropdown & Quick Create */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Job Select Dropdown */}
          <div className="relative flex-1 lg:w-64">
            <select
              value={selectedJobId || ""}
              onChange={(e) => onSelectJob(e.target.value)}
              className="w-full bg-[#111c17] border border-line rounded-lg px-3 py-1.5 text-xs text-white font-mono appearance-none focus:outline-none focus:border-signal cursor-pointer"
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel hover:bg-line border border-line/80 text-xs font-semibold text-white transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-signal" />
            <span>Post Job</span>
          </button>

          <button
            onClick={() => {
              onRefreshJobs();
              loadJobDetails();
            }}
            className="p-1.5 rounded-lg bg-panel hover:bg-line border border-line/80 text-dim hover:text-white transition-all"
            title="Refresh Ledger"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Action Controller Strip */}
      <div className="mt-4 p-3 rounded-xl bg-[#090f0c] border border-line/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-dim uppercase">Current Job State:</span>
          <span
            className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${
              state === 6
                ? "bg-ok/10 border-ok/40 text-ok"
                : state === 7
                ? "bg-bad/10 border-bad/40 text-bad"
                : "bg-signal/10 border-signal/40 text-signal"
            }`}
          >
            {currentStatus.text}
          </span>
        </div>

        {/* Step Trigger Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={busyAction !== null || state !== 1}
            onClick={handleAccept}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-signal text-ink font-bold text-xs hover:brightness-110 disabled:opacity-30 disabled:pointer-events-none shadow-sm transition-all"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>1. Machine Accept</span>
          </button>

          <button
            disabled={busyAction !== null || state !== 3}
            onClick={() => handleReportEvidence("success")}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-ok text-ink font-bold text-xs hover:brightness-110 disabled:opacity-30 disabled:pointer-events-none shadow-sm transition-all"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>2. Report Delivery (Success)</span>
          </button>

          <button
            disabled={busyAction !== null || state !== 3}
            onClick={() => handleReportEvidence("fail")}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-bad text-white font-bold text-xs hover:brightness-110 disabled:opacity-30 disabled:pointer-events-none shadow-sm transition-all"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>2b. Report Missed Target (Fail)</span>
          </button>

          <button
            disabled={busyAction !== null || ![1, 2, 3, 4].includes(state)}
            onClick={handleRefund}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-line bg-panel hover:bg-line text-dim hover:text-white font-semibold text-xs disabled:opacity-30 disabled:pointer-events-none transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Refund Escrow</span>
          </button>
        </div>
      </div>

      {/* VISUAL NODE CANVAS (DAG) */}
      <div className="mt-6 relative">
        {/* Background Decorative Grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#25332d_1px,transparent_1px)] [background-size:16px_16px] opacity-25 pointer-events-none" />

        {/* Nodes Grid */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {nodeConfigs.map((node) => {
            const nodeState = getNodeState(node.step);
            const Icon = node.icon;

            const isCurrentActive =
              (node.step === 1 && state === 0) ||
              (node.step === 2 && state === 1) ||
              (node.step === 3 && (state === 2 || state === 3)) ||
              (node.step === 4 && state === 3) ||
              (node.step === 5 && (state === 4 || state === 5)) ||
              (node.step === 6 && state === 6);

            const statusColors = {
              completed: "border-ok/40 bg-[#0e1c15] text-ok shadow-[0_0_15px_rgba(94,230,168,0.12)]",
              active: "border-signal/70 bg-[#171b13] text-signal glow-signal-node",
              pending: "border-line/60 bg-[#0c1411]/80 text-dim",
              failed: "border-bad/60 bg-[#1e1313] text-bad shadow-[0_0_15px_rgba(255,107,94,0.15)]",
            };

            return (
              <div
                key={node.step}
                onClick={() => openInspectorForStep(node.step)}
                className={`group cursor-pointer rounded-xl border p-4 transition-all duration-200 hover:-translate-y-1 hover:border-signal/70 hover:shadow-2xl relative ${
                  statusColors[nodeState]
                }`}
              >
                {/* Node Card Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-sm border ${
                        nodeState === "completed"
                          ? "bg-ok/20 border-ok/50 text-ok"
                          : nodeState === "active"
                          ? "bg-signal/20 border-signal/50 text-signal"
                          : nodeState === "failed"
                          ? "bg-bad/20 border-bad/50 text-bad"
                          : "bg-panel border-line text-dim"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white tracking-wide group-hover:text-signal transition-colors">
                        {node.name}
                      </h4>
                      <p className="text-[11px] text-dim font-mono">{node.sub}</p>
                    </div>
                  </div>

                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase font-bold tracking-wider ${
                      nodeState === "completed"
                        ? "bg-ok/10 border-ok/40 text-ok"
                        : nodeState === "active"
                        ? "bg-signal/15 border-signal/50 text-signal"
                        : nodeState === "failed"
                        ? "bg-bad/10 border-bad/40 text-bad"
                        : "bg-line/40 border-line text-dim"
                    }`}
                  >
                    {nodeState === "completed" ? "VERIFIED" : node.badge}
                  </span>
                </div>

                {/* Node Detail Metric Badge */}
                <div className="mt-2 py-1.5 px-2.5 rounded-md bg-[#080d0b] border border-line/50 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-dim/80">Payload:</span>
                  <span className="font-semibold text-white/90">{node.dataPill}</span>
                </div>

                {/* Inspect Footer Link */}
                <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-dim/70 pt-2 border-t border-line/30 group-hover:text-signal transition-colors">
                  <span>Step 0{node.step} / 06</span>
                  <span className="flex items-center gap-1 font-sans font-semibold">
                    Inspect Telemetry <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>

                {/* Pulsing indicator blip for active stage */}
                {isCurrentActive && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-signal"></span>
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Live Event & Telemetry Console Strip at Bottom of Canvas */}
        {activeLog.length > 0 && (
          <div className="mt-5 p-3 rounded-xl border border-line/60 bg-[#070b09] font-mono text-[11px] space-y-1">
            <div className="flex items-center justify-between text-dim border-b border-line/40 pb-1 mb-1 text-[10px] uppercase tracking-wider">
              <span>Pipeline Telemetry Log</span>
              <span className="text-ok">● Live Receiver</span>
            </div>
            {activeLog.map((line, idx) => (
              <div key={idx} className="text-white/80 truncate">
                <span className="text-signal mr-1.5">›</span>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Inspector Component */}
      <NodeInspectorModal nodeData={inspectedNode} onClose={() => setInspectedNode(null)} />
    </div>
  );
}
