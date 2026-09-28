import { useEffect, useState } from "react";
import { formatEther, ZeroAddress } from "ethers";
import { getReadProvider, getEscrow, decodeContractError } from "../lib/wallet";
import { machineApi } from "../lib/api";
import { statusLabel } from "./JobList";
import { cfg, DEFAULT_EVIDENCE_TARGET } from "../lib/config";
import { addressBook } from "../lib/addressBook";
import { priceFeed } from "../lib/priceFeed";
import { JobTimeline } from "./JobTimeline";

export function JobDetail({ jobId, signer }: { jobId: string; signer: any }) {
  const [job, setJob] = useState<any | null>(null);
  const [queueInfo, setQueueInfo] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  async function load() {
    const provider = getReadProvider();
    const escrow = getEscrow(provider);
    const j = await escrow.getJob(jobId);
    setJob(j);

    try {
      const bRes = await fetch(`${cfg.backendUrl || "http://localhost:4000"}/jobs/${jobId}`);
      if (bRes.ok) {
        const bJson = await bRes.json();
        if (bJson.queueInfo) setQueueInfo(bJson.queueInfo);
      }
    } catch {}
  }

  useEffect(() => {
    load();
    const provider = getReadProvider();
    const escrow = getEscrow(provider);

    escrow.on("JobAccepted", load);
    escrow.on("JobExecutionStarted", load);
    escrow.on("ProofSubmitted", load);
    escrow.on("VerificationSubmitted", load);
    escrow.on("PaymentReleased", load);
    escrow.on("JobRefunded", load);

    return () => {
      escrow.off("JobAccepted", load);
      escrow.off("JobExecutionStarted", load);
      escrow.off("ProofSubmitted", load);
      escrow.off("VerificationSubmitted", load);
      escrow.off("PaymentReleased", load);
      escrow.off("JobRefunded", load);
    };
  }, [jobId]);

  function pushLog(line: string) {
    setLog((l) => [line, ...l].slice(0, 20));
  }

  // Step 1: machine agent accepts + starts execution
  async function handleAccept() {
    setBusy("accept");
    try {
      const res = await machineApi.acceptJob(jobId);
      pushLog(`Machine accepted. accept=${res.acceptTx?.slice(0, 10)}… start=${res.startTx?.slice(0, 10)}…`);
    } catch (e: any) {
      pushLog(`Accept failed: ${e.message}`);
    } finally {
      setBusy(null);
      load();
    }
  }

  // Step 2: robot reports completion
  async function handleReportEvidence(mode: "success" | "fail") {
    setBusy(mode);
    const { packageId, target } = DEFAULT_EVIDENCE_TARGET;
    try {
      const res = await machineApi.submitEvidence(jobId, {
        packageId,
        target,
        finalPosition: mode === "success" ? { x: target.x, y: target.y } : { x: 1, y: 1 },
        delivered: mode === "success",
        result: mode,
      });
      pushLog(
        `Evidence submitted (${mode}). verification.passed=${res.verification?.passed} ` +
          `settleTx=${res.verification?.settleTx?.slice(0, 10)}…`
      );
    } catch (e: any) {
      pushLog(`Evidence submission failed: ${e.message}`);
    } finally {
      setBusy(null);
      load();
    }
  }

  async function handleRefund() {
    if (!signer) return pushLog("Connect your wallet to request a refund.");
    setBusy("refund");
    const escrow = getEscrow(signer);
    try {
      const tx = await escrow.refund(jobId);
      await tx.wait();
      pushLog(`Refund tx ${tx.hash.slice(0, 10)}… confirmed.`);
    } catch (e: any) {
      pushLog(`Refund failed: ${decodeContractError(e, escrow)}`);
    } finally {
      setBusy(null);
      load();
    }
  }

  if (!job) return <div className="bg-card border border-border rounded-lg shadow-sm p-4 text-xs font-mono text-muted">Loading job…</div>;

  const state = Number(job.state);
  const verdict = Number(job.verdict);
  const status = statusLabel(state, verdict);

  const customerResolved = addressBook.resolve(job.customer);
  const machineResolved =
    job.machineWallet !== ZeroAddress ? addressBook.resolve(job.machineWallet) : null;
  const rewardEth = formatEther(job.reward);
  const rewardUsd = priceFeed.toUsdString(rewardEth);

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* 1. Job Lifecycle Horizontal Stepper (Feature 6) */}
      <JobTimeline
        state={state}
        verdict={verdict}
        createdAt={Number(job.createdAt || 0)}
        deadline={Number(job.deadline || 0)}
      />

      {/* 2. Job Detail Specifications Card */}
      <div className="bg-card border border-border rounded-lg shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <span className="text-[10px] uppercase text-secondary tracking-wider">Job Escrow Identifier</span>
            <h2 className="font-mono text-xs font-bold text-primary truncate max-w-md">{jobId}</h2>
          </div>
          <div className="flex items-center gap-2">
            {queueInfo && queueInfo.status === "QUEUED" && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                Queue Pos: #{queueInfo.queuePosition} of {queueInfo.totalQueue}
              </span>
            )}
            {queueInfo && queueInfo.status === "RUNNING" && state < 6 && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse">
                Active in Simulator
              </span>
            )}
            <span
              className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                state === 6 ? "pill-confirmed" : state === 7 ? "pill-failed" : "pill-pending"
              }`}
            >
              {status.text}
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-y-2 text-xs">
          {/* Customer Address with Tooltip */}
          <dt className="text-secondary">Customer</dt>
          <dd className="text-right" title={job.customer}>
            <span className="font-bold text-primary">{customerResolved.label}</span>
            <span className="text-[10px] text-muted block">{customerResolved.truncated}</span>
          </dd>

          {/* Reward with USD Conversion */}
          <dt className="text-secondary">Reward Escrow</dt>
          <dd className="text-right">
            <span className="font-bold text-primary text-sm">{rewardEth} {cfg.nativeToken}</span>
            <span className="text-[10px] text-muted block">{rewardUsd}</span>
          </dd>

          {/* Machine Wallet with Tooltip */}
          <dt className="text-secondary">Machine Worker</dt>
          <dd className="text-right">
            {machineResolved ? (
              <div title={job.machineWallet}>
                <span className="font-bold text-accent-blue">{machineResolved.label}</span>
                <span className="text-[10px] text-muted block">{machineResolved.truncated}</span>
              </div>
            ) : (
              <span className="text-muted">— not yet accepted —</span>
            )}
          </dd>

          <dt className="text-secondary">Deadline</dt>
          <dd className="text-right text-secondary">
            {new Date(Number(job.deadline) * 1000).toLocaleString()}
          </dd>
        </dl>

        {/* Action Controls */}
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <button
            disabled={busy !== null || state !== 1}
            onClick={handleAccept}
            className="rounded bg-accent-amber hover:bg-amber-600 text-white px-3 py-1.5 text-xs font-semibold shadow-xs disabled:opacity-40 transition-colors"
          >
            {busy === "accept" ? "Accepting…" : "1 · Machine: Accept + Start"}
          </button>
          <button
            disabled={busy !== null || state !== 3}
            onClick={() => handleReportEvidence("success")}
            className="rounded bg-accent-green hover:bg-green-600 text-white px-3 py-1.5 text-xs font-semibold shadow-xs disabled:opacity-40 transition-colors"
          >
            {busy === "success" ? "Submitting…" : "2 · Robot: Delivered (Release)"}
          </button>
          <button
            disabled={busy !== null || state !== 3}
            onClick={() => handleReportEvidence("fail")}
            className="rounded bg-accent-red hover:bg-red-600 text-white px-3 py-1.5 text-xs font-semibold shadow-xs disabled:opacity-40 transition-colors"
          >
            {busy === "fail" ? "Submitting…" : "2 · Robot: Missed Target (Fail)"}
          </button>
          <button
            disabled={busy !== null || ![1, 2, 3, 4].includes(state)}
            onClick={handleRefund}
            className="rounded border border-border bg-page hover:bg-gray-100 px-3 py-1.5 text-xs font-semibold text-secondary hover:text-primary disabled:opacity-40 transition-colors"
          >
            Request Refund
          </button>
        </div>

        {log.length > 0 && (
          <div className="max-h-32 overflow-y-auto rounded border border-border bg-page p-2 font-mono text-[11px] text-secondary space-y-0.5">
            {log.map((line, i) => (
              <div key={i}>
                <span className="text-accent-blue mr-1">›</span> {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
