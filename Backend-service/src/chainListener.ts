import { formatEther } from "ethers";
import { provider, getEscrow, getRegistry, cfg } from "./config";
import { machineIdToString } from "./signing";
import { upsertJob } from "./store";
import { recordAndEmitTx } from "./transactionStore";
import { getMetadataByHash, verifyMetadata } from "./metadataStore";
import { enqueueJob } from "./simulatorRelay";
import {
  isJobActionDone,
  updateProcessedJob,
} from "./jobPersistence";
import { getEvidence } from "./evidenceStore";
import { verifyAndSettle } from "./verifierService";
import { MACHINE_ID_TEXT } from "./machineAgent";

let lastProcessedBlock = 0;
let isPolling = false;

export async function processEventsInRange(fromBlock: number, toBlock: number) {
  const escrow = getEscrow();

  // 1. JobCreated
  const createdFilter = escrow.filters.JobCreated();
  const createdEvents = await escrow.queryFilter(createdFilter, fromBlock, toBlock);
  for (const ev of createdEvents) {
    const args = (ev as any).args;
    if (!args) continue;
    const jobId = args.jobId as string;
    const customer = args.customer as string;
    const reward = args.reward as bigint;
    const metadataHash = args.metadataHash as string;
    const description = args.description as string;
    const txHash = ev.transactionHash;
    const blockNumber = ev.blockNumber;

    console.log(
      `[chain-listener] Event JobCreated: jobId=${jobId.slice(0, 10)}… reward=${formatEther(reward)} desc="${description}"`
    );

    recordAndEmitTx({
      id: `evt-${jobId.slice(0, 8)}-created`,
      txHash,
      from: customer,
      to: cfg.addresses.JobEscrow,
      amount: `${formatEther(reward)} ${cfg.nativeToken}`,
      type: "escrow-deposit",
      status: "confirmed",
      blockNumber,
      timestamp: "Just now",
      timeMillis: Date.now(),
      jobId,
      nodeType: "contract",
    });

    if (isJobActionDone(jobId, "settled")) {
      console.log(`[chain-listener] Job ${jobId.slice(0, 10)}… is already settled. Skipping.`);
      continue;
    }

    // Requirement 3: Check metadata and REJECT if mismatch
    const meta = getMetadataByHash(metadataHash);
    if (!meta || !verifyMetadata(meta, metadataHash)) {
      console.error(
        `[chain-listener] REJECTED job ${jobId}: metadataHash (${metadataHash}) does not match registered canonical metadata!`
      );
      upsertJob(jobId, { stage: "error", error: "Metadata hash verification failed" });
      continue;
    }

    console.log(`[chain-listener] Metadata verified for job ${jobId.slice(0, 10)}… task=${meta.taskType}`);
    upsertJob(jobId, { stage: "idle" });

    // Enqueue job for machine
    enqueueJob({
      jobId,
      machineId: MACHINE_ID_TEXT,
      taskType: meta.taskType,
      reward: formatEther(reward),
      source: meta.source,
      target: meta.target,
      simulateFailure: meta.simulateFailure,
    });
  }

  // 2. JobAccepted
  const acceptedFilter = escrow.filters.JobAccepted();
  const acceptedEvents = await escrow.queryFilter(acceptedFilter, fromBlock, toBlock);
  for (const ev of acceptedEvents) {
    const args = (ev as any).args;
    if (!args) continue;
    const jobId = args.jobId as string;
    const machineId = machineIdToString(args.machineId as string);
    const machineWallet = args.machineWallet as string;

    upsertJob(jobId, { stage: "accepted", machineId });
    updateProcessedJob(jobId, { accepted: true, stage: "accepted" });

    recordAndEmitTx({
      id: `evt-${jobId.slice(0, 8)}-accepted`,
      txHash: ev.transactionHash,
      from: machineWallet,
      to: cfg.addresses.JobEscrow,
      amount: "0.00 ETH",
      type: "escrow-accept",
      status: "confirmed",
      blockNumber: ev.blockNumber,
      timestamp: "Just now",
      timeMillis: Date.now(),
      jobId,
      nodeType: "normal",
    });
  }

  // 3. JobExecutionStarted
  const startedFilter = escrow.filters.JobExecutionStarted();
  const startedEvents = await escrow.queryFilter(startedFilter, fromBlock, toBlock);
  for (const ev of startedEvents) {
    const args = (ev as any).args;
    if (!args) continue;
    const jobId = args.jobId as string;
    const machineId = machineIdToString(args.machineId as string);

    upsertJob(jobId, { stage: "executing" });
    updateProcessedJob(jobId, { executing: true, stage: "executing" });

    recordAndEmitTx({
      id: `evt-${jobId.slice(0, 8)}-started`,
      txHash: ev.transactionHash,
      from: cfg.addresses.JobEscrow,
      to: machineId,
      amount: "0.00 ETH",
      type: "escrow-start",
      status: "confirmed",
      blockNumber: ev.blockNumber,
      timestamp: "Just now",
      timeMillis: Date.now(),
      jobId,
      nodeType: "normal",
    });
  }

  // 4. ProofSubmitted
  const proofFilter = escrow.filters.ProofSubmitted();
  const proofEvents = await escrow.queryFilter(proofFilter, fromBlock, toBlock);
  for (const ev of proofEvents) {
    const args = (ev as any).args;
    if (!args) continue;
    const jobId = args.jobId as string;
    const machineId = machineIdToString(args.machineId as string);
    const result = Number(args.result);

    upsertJob(jobId, { stage: "proof_submitted" });
    updateProcessedJob(jobId, { proofSubmitted: true, stage: "proof_submitted" });

    recordAndEmitTx({
      id: `evt-${jobId.slice(0, 8)}-proof`,
      txHash: ev.transactionHash,
      from: machineId,
      to: cfg.addresses.JobEscrow,
      amount: "0.00 ETH",
      type: "proof-submit",
      status: "confirmed",
      blockNumber: ev.blockNumber,
      timestamp: "Just now",
      timeMillis: Date.now(),
      jobId,
      nodeType: result === 1 ? "normal" : "suspicious",
    });
  }

  // 5. VerificationSubmitted
  const verifFilter = escrow.filters.VerificationSubmitted();
  const verifEvents = await escrow.queryFilter(verifFilter, fromBlock, toBlock);
  for (const ev of verifEvents) {
    const args = (ev as any).args;
    if (!args) continue;
    const jobId = args.jobId as string;
    const verifier = args.verifier as string;
    const passed = Boolean(args.passed);

    upsertJob(jobId, { stage: passed ? "verified" : "proof_submitted", passed });
    updateProcessedJob(jobId, { verified: true, verdict: passed ? "PASS" : "FAIL" });

    recordAndEmitTx({
      id: `evt-${jobId.slice(0, 8)}-attestation`,
      txHash: ev.transactionHash,
      from: verifier,
      to: cfg.addresses.JobEscrow,
      amount: "0.00 ETH",
      type: "verifier-attest",
      status: passed ? "confirmed" : "failed",
      blockNumber: ev.blockNumber,
      timestamp: "Just now",
      timeMillis: Date.now(),
      jobId,
      nodeType: passed ? "normal" : "mule",
    });
  }

  // 6. PaymentReleased
  const paidFilter = escrow.filters.PaymentReleased();
  const paidEvents = await escrow.queryFilter(paidFilter, fromBlock, toBlock);
  for (const ev of paidEvents) {
    const args = (ev as any).args;
    if (!args) continue;
    const jobId = args.jobId as string;
    const machineId = machineIdToString(args.machineId as string);
    const wallet = (args.machineWallet || args.wallet) as string;
    const amount = args.amount as bigint;


    console.log(`[chain-listener] Event PaymentReleased for job ${jobId.slice(0, 10)}… -> ${wallet}`);
    upsertJob(jobId, { stage: "paid" });
    updateProcessedJob(jobId, { settled: true, stage: "paid", verdict: "PASS" });

    recordAndEmitTx({
      id: `evt-${jobId.slice(0, 8)}-paid`,
      txHash: ev.transactionHash,
      from: cfg.addresses.JobEscrow,
      to: wallet,
      amount: `${formatEther(amount)} ${cfg.nativeToken}`,
      type: "escrow-release",
      status: "confirmed",
      blockNumber: ev.blockNumber,
      timestamp: "Just now",
      timeMillis: Date.now(),
      jobId,
      nodeType: "normal",
    });
  }

  // 7. JobRefunded
  const refundFilter = escrow.filters.JobRefunded();
  const refundEvents = await escrow.queryFilter(refundFilter, fromBlock, toBlock);
  for (const ev of refundEvents) {
    const args = (ev as any).args;
    if (!args) continue;
    const jobId = args.jobId as string;
    const customer = args.customer as string;
    const amount = args.amount as bigint;

    console.log(`[chain-listener] Event JobRefunded for job ${jobId.slice(0, 10)}… -> ${customer}`);
    upsertJob(jobId, { stage: "refunded" });
    updateProcessedJob(jobId, { settled: true, stage: "refunded", verdict: "FAIL" });

    recordAndEmitTx({
      id: `evt-${jobId.slice(0, 8)}-refund`,
      txHash: ev.transactionHash,
      from: cfg.addresses.JobEscrow,
      to: customer,
      amount: `${formatEther(amount)} ${cfg.nativeToken}`,
      type: "escrow-refund",
      status: "failed",
      blockNumber: ev.blockNumber,
      timestamp: "Just now",
      timeMillis: Date.now(),
      jobId,
      nodeType: "suspicious",
    });
  }
}

/**
 * Startup Reconciliation:
 * Scans past events and reads getJob() on chain so jobs in
 * FUNDED/ACCEPTED/EXECUTING/PROOF_SUBMITTED are resumed after restart.
 */
export async function reconcilePastJobs() {
  const escrow = getEscrow();
  try {
    const currentBlock = await provider.getBlockNumber();
    console.log(`[reconciliation] Current block number: ${currentBlock}`);

    // Scan from block 0 (or recent) to current block
    const fromBlock = 0;
    const toBlock = currentBlock;

    await processEventsInRange(fromBlock, toBlock);
    lastProcessedBlock = currentBlock;

    // Check on-chain job states for any active jobs
    const jobCountBig = await escrow.jobCount();
    const count = Number(jobCountBig);
    console.log(`[reconciliation] Total on-chain jobs: ${count}`);

    if (count > 0) {
      const jobIds: string[] = await escrow.getJobIds(0, Math.min(count, 50));
      for (const jId of jobIds) {
        if (isJobActionDone(jId, "settled")) continue;

        const job = await escrow.getJob(jId);
        const state = Number(job.state);

        // state: 1 FUNDED, 2 ACCEPTED, 3 EXECUTING, 4 PROOF_SUBMITTED, 5 VERIFIED, 6 PAID, 7 REFUNDED
        if (state === 6) {
          updateProcessedJob(jId, { settled: true, stage: "paid", verdict: "PASS" });
        } else if (state === 7) {
          updateProcessedJob(jId, { settled: true, stage: "refunded", verdict: "FAIL" });
        } else if (state === 4) {
          // PROOF_SUBMITTED: check if we have evidence to verify
          const ev = getEvidence(jId);
          if (ev) {
            console.log(`[reconciliation] Resuming verification for PROOF_SUBMITTED job ${jId.slice(0, 10)}…`);
            // Attempt verification if not yet attested
            try {
              // Read on-chain proofHash and trigger verifier
              await verifyAndSettle({
                jobId: jId,
                proof: {
                  jobId: jId,
                  machineId: job.machineId,
                  result: ev.simulateFailure ? 0 : 1,
                  timestamp: 0,
                  nonce: 0,
                  evidenceHash: job.evidenceHash,
                },
                signature: "",
                evidence: ev as any,
              });
            } catch (err: any) {
              console.warn(`[reconciliation] Verification resumption note for ${jId}:`, err?.message);
            }
          }
        } else if (state >= 1 && state <= 3) {
          // Resume job
          const meta = getMetadataByHash(job.metadataHash);
          if (meta && verifyMetadata(meta, job.metadataHash)) {
            console.log(`[reconciliation] Resuming in-flight job ${jId.slice(0, 10)}… (state=${state})`);
            enqueueJob({
              jobId: jId,
              machineId: MACHINE_ID_TEXT,
              taskType: meta.taskType,
              reward: formatEther(job.reward),
              source: meta.source,
              target: meta.target,
              simulateFailure: meta.simulateFailure,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[reconciliation] Error during startup reconciliation:", err);
  }
}

export function startChainListener() {
  console.log("[chain-listener] Initializing chain listener with reconciliation & block polling…");

  reconcilePastJobs().then(() => {
    // Start block polling
    setInterval(async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        const currentBlock = await provider.getBlockNumber();
        if (currentBlock > lastProcessedBlock) {
          const from = lastProcessedBlock + 1;
          const to = currentBlock;
          await processEventsInRange(from, to);
          lastProcessedBlock = currentBlock;
        }
      } catch (err) {
        // RPC glitch, will retry next tick
      } finally {
        isPolling = false;
      }
    }, 1500);
    console.log("[chain-listener] Event poller active.");
  });
}
